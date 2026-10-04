"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CHECKING_STATE, missingClientId, resolveView, startLogin, waitLogin } from "@/lib/admin/auth";
import { loadSiteConfig } from "@/lib/admin/config";
import { classifyError } from "@/lib/admin/errors";
import { clearSession, readSession } from "@/lib/admin/session";
import type { StorageLike } from "@/lib/admin/session";
import { bootstrapRepo, repoMismatch } from "@/lib/admin/bootstrap";
import { FIRST_TAB, moveTab, tabAction, tabDomId } from "@/lib/admin/tabs";
import type { TabKey } from "@/lib/admin/tabs";
import { loginOutcome } from "@/lib/admin/uiModel";
import type { SiteConfig } from "@/lib/types";
import DeniedPanel from "./DeniedPanel";
import LoginPanel from "./LoginPanel";
import ReviewPane from "./ReviewPane";
import Workbench from "./Workbench";

/** 设备码六件套：clientId/deviceCode 用来换 token，userCode/verificationUri 给人看，interval/expiresIn 定节奏。
 *  存 state 而非 ref——LoginPanel 要随它重渲，ref 改了不触发渲染。 */
interface Device {
  clientId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

/** pane 的上下文包（D9）：外壳只注入「身份 + 上下文」，不注入数据。
 *  四个 pane 各自在 effect 里发起自己的读，并把模块级 FETCH 显式当实参交给 src/lib/admin/*。
 *  为什么不把四个 pane 的读态上收到这里：外壳会因此多出八份 state 与两套「何时算过期」，
 *  而 token 也得不到第二份镜像——过期这件事仍然只有 markExpired 一个出口。
 *  Task 9/10/11 逐字沿用它。type-only 反向导入（ReviewPane → 本文件）编译期擦除，不构成运行时循环。 */
export interface PaneCtx {
  repo: string;
  token: string;
  login: string;
  storage: StorageLike;
  config: SiteConfig | null;
  onExpired: (hint: string) => void;
}

/** §1 红线 3：transport 只在这一处出现，且显式传 globalThis.fetch；组件与 lib 里不许有 mock 分支。
 *  bind 不是仪式感：把 fetch 当裸函数引用后不带 receiver 调用，在 Safari 与旧版 Chrome 会抛
 *  「Illegal invocation」——lib 侧的默认参数是 globalThis.fetch（调用点带 receiver），
 *  这里以实参传入时必须是绑定过的同一个函数。Task 7/9/10/11 的 pane 沿用同一个 FETCH。 */
const FETCH = globalThis.fetch.bind(globalThis);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function AdminApp() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [repo] = useState(() => bootstrapRepo()); // D4：编译期内联值，一次算定，没有 setState 的理由
  const [state, setState] = useState(CHECKING_STATE);
  const [device, setDevice] = useState<Device | null>(null);
  const [polling, setPolling] = useState<{ interval: number } | null>(null);
  const [active, setActive] = useState<TabKey>(FIRST_TAB);
  const [focusKey, setFocusKey] = useState<TabKey>(FIRST_TAB);
  const [banner, setBanner] = useState("");
  /** 只跑一次的闸：reactStrictMode:true 实测开着，effect 会被调两遍；resolveView 打 GitHub 真接口，双跑白耗限流额度 */
  const booted = useRef(false);

  /** 顶层不碰 window（§1 红线 2）：静态导出的预渲染阶段 window 不存在，这里在 render 期只做存在性判断 */
  const storage = useMemo(() => (typeof window === "undefined" ? null : window.sessionStorage), []);

  const refresh = useCallback(
    async (cfg: SiteConfig) => {
      if (!storage) return;
      const next = await resolveView({ config: cfg, storage, fetchImpl: FETCH });
      setState(next);
      const s = readSession(storage);
      if (s?.token) setToken(s.token);
      // resolveView 在 expired 分支里已经 clearSession，本层不再清第二遍
    },
    [storage],
  );

  useEffect(() => {
    if (booted.current || !storage) return;
    booted.current = true;
    (async () => {
      if (!repo) {
        // D4 寻址失败：连 config 在哪个仓都不知道，连读都不该读。repo 为空由 LoginPanel 的 blocked 分支解释。
        setState({ ...CHECKING_STATE, view: "login" });
        return;
      }
      try {
        const r = await loadSiteConfig({ repo, fetchImpl: FETCH });
        setConfig(r.config);
        const conflict = repoMismatch(repo, r.config.githubRepo ?? "");
        if (conflict) setBanner(conflict);
        await refresh(r.config);
      } catch (e) {
        // 读不到 config 归入引导态（D9），措辞原样搬运 classifyError——不在这儿编造原因
        const c = classifyError(e);
        setState({ ...CHECKING_STATE, view: "unconfigured", hint: `${c.message}${c.hint ? `（${c.hint}）` : ""}` });
      }
    })();
  }, [refresh, repo, storage]);

  const onStart = useCallback(async () => {
    // !storage 并入既有早退：waitLogin 落会话、refresh 取身份都要 storage，缺失时本就无法登录成功；
    //  顺带把它收窄为非空，过 tsc（与 refresh/onLogout 同一守卫口径）——属编译必需的实施细节，非态判断。
    if (!storage || !config || missingClientId(config) || !repo) return;
    setBanner("");
    try {
      const d = (await startLogin({ config, fetchImpl: FETCH })) as Record<string, unknown>;
      const next: Device = {
        clientId: String(config.oauthClientId).trim(),
        deviceCode: String(d.deviceCode),
        userCode: String(d.userCode),
        verificationUri: String(d.verificationUri),
        interval: Number(d.interval) || 5,
        expiresIn: Number(d.expiresIn) || 900,
      };
      setDevice(next);
      setPolling({ interval: next.interval });
      const res = await waitLogin({
        clientId: next.clientId,
        deviceCode: next.deviceCode,
        interval: next.interval,
        expiresIn: next.expiresIn,
        storage,
        fetchImpl: FETCH,
        sleep,
      });
      setPolling(null);
      setDevice(null);
      const outcome = loginOutcome(res);
      if (outcome) {
        setBanner(outcome);
        return;
      }
      await refresh(config);
    } catch (e) {
      setPolling(null);
      setDevice(null);
      const c = classifyError(e);
      setBanner(`✗ 登录请求失败：${c.message}（${c.hint}）`);
    }
  }, [config, refresh, repo, storage]);

  /** token 只在「读到一个非空的」时写 state，过期时不写空：
   *  D7 第二条要把人留在值班室里看黄条，若顺手抹掉 token，ctx 变 null、Tab1 那一格会被占位文案换掉——
   *  那等于把「他刚才正在读的东西」也一起没收了。真正的清场只在 onLogout（那时整个 Workbench 都不渲了）。 */
  const [token, setToken] = useState("");
  const [pendingCount, setPendingCount] = useState(0); // pane 报数，徽标仍由 Workbench 统一渲（Tab1 的 .n）

  /** D7 第二条出口的唯一入口：pane 的在途请求任一条吃到 401，由这里清会话并把视图翻成 expired。
   *  hint 是 pane 递上来的 classifyError 原文，黄条措辞仍由 Workbench 的 expiredBarText 独家负责。 */
  const markExpired = useCallback(
    (hint: string) => {
      if (storage) clearSession(storage);
      setState((prev) => ({ ...prev, view: "expired", hint }));
    },
    [storage],
  );

  /** D7 第二条出口（markExpired）自 Task 7 起真正接通：ReviewPane 的在途 401 由 ctx.onExpired 走到它。
   *   expired 的两条来路（D7）——首屏就过期 → LoginPanel；在途请求吃到 401 → 留在 Workbench 顶挂黄条（见下 inWorkbench）。 */
  const onLogout = useCallback(() => {
    if (storage) clearSession(storage);
    setToken("");
    setPendingCount(0);
    setState({ ...CHECKING_STATE, view: "login" });
    setBanner("");
  }, [storage]);

  const onKey = useCallback(
    (e: ReactKeyboardEvent) => {
      const a = tabAction(e.key);
      if (!a) return;
      e.preventDefault(); // 只吞 ←/→/Home/End：Tab 与 Enter 由 tabAction 返回 null 放过
      const next = moveTab(active, a);
      setActive(next);
      setFocusKey(next);
      document.getElementById(tabDomId(next))?.focus(); // roving tabindex：焦点必须跟着走，此句不可省
    },
    [active],
  );

  /** expired 有两种来路（D7），外壳留不留取决于「还认不认得出刚才是谁」：
   *  resolveView 的两条 expired 分支都带 `login: s.login`（auth.ts:69/74 实测），说明会话至少曾经成立过——
   *  这时把人留在值班室里、顶上挂黄条，比把他扔回登录页更能让他看懂发生了什么。
   *  `login` 为空的 expired 只可能是伪造态，回 LoginPanel。Task 7 的 markExpired 沿用同一个条件。 */
  const inWorkbench = state.view === "ready" || (state.view === "expired" && Boolean(state.login));

  /** ctx 自己必须 memo：pane 的 effect 依赖 [repo, token]，若每次渲染都交一个新 ctx 对象，
   *  Task 9/10/11 里那些「依赖整个 ctx」的写法就会每次渲染重打一次 GitHub 读；
   *  顺带把「每次渲染 readSession 一遍」关掉——渲染期读 sessionStorage 既慢又让 pane 拿到抖动值。 */
  const ctx: PaneCtx | null = useMemo(() => {
    if (!inWorkbench || !storage || !token) return null;
    return { repo, token, login: state.login, storage, config, onExpired: markExpired };
  }, [inWorkbench, repo, token, state.login, storage, config, markExpired]);

  const bar = banner ? (
    <p className="adm-statebar bad" role="alert">
      {banner}
    </p>
  ) : null;

  if (state.view === "denied") return <DeniedPanel state={state} />;
  if (!inWorkbench)
    return (
      <>
        {bar}
        <LoginPanel
          view={state}
          repo={repo}
          /** 「缺 client_id」只有两种情况下才该说：config 读回来了且真的缺（missingClientId），
           *  或外壳压根没读到 config 而落进 unconfigured（Step 5 的 catch 归口，C7）——后者由 blocked 分支
           *  渲出 classifyError 的真实 hint 并把按钮禁掉。checking 期间两个都不成立：
           *  那时只是「还没读」，谎报会把 checking 抢掉。 */
          clientIdMissing={config ? missingClientId(config) : state.view === "unconfigured"}
          flow={device}
          polling={polling}
          onStart={onStart}
        />
      </>
    );
  return (
    <>
      {bar}
      <Workbench state={state} active={active} focusKey={focusKey} pendingCount={pendingCount} onTab={setFocusKey} onKey={onKey} onLogout={onLogout}>
        {active === "review" ? (
          ctx ? (
            <ReviewPane ctx={ctx} onCount={setPendingCount} />
          ) : (
            <p className="adm-why">登录态尚未就绪：会话里没有可用的凭证，等一次重新登录或刷新。</p>
          )
        ) : (
          <p className="adm-why">面板内容在 Task 9（变现配置）、Task 10（触发爬取）、Task 11（发布历史）逐格接入。</p>
        )}
      </Workbench>
    </>
  );
}

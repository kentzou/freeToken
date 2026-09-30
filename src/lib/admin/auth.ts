/** 视图状态层：把 transport 结果翻译成 UI 能直接渲染的判别联合（本文件不含任何 React）。
 *  六态＝原型工具栏四态（未登录 / 白名单拒绝 / token 过期 / 已登录）
 *        + unconfigured（占位值不可用，见计划 §0 与 §3 决策 5）
 *        + checking（resolveView 落地前的占位）。 */
import { allowlistCheck, denyNote } from "../../../crawler/allowlist.mjs";
import { fetchUserLogin, pollDeviceToken, requestDeviceCode } from "../../../crawler/github.mjs";
import {
  clearSession,
  readSession,
  saveSession,
  sessionVerdict,
  type AdminSession,
  type StorageLike,
} from "./session";

export type AdminView = "unconfigured" | "login" | "checking" | "denied" | "expired" | "ready";

/** 传输接缝的宽松签名：crawler/*.mjs 的多态应答（kind 判别联合）在 .mjs 里不导出类型，
 *  故此处按「读事实」就地标注——与 scripts/review-apply.mjs 给 fetchImpl 写 JSDoc 同一口径。 */
type Fetch = (url: any, init?: any) => Promise<any>;

export interface AdminState {
  view: AdminView;
  login: string;
  avatarUrl: string;
  scope: string;
  hint: string;
}

export interface ConfigLike {
  oauthClientId?: string;
  adminLogins?: string[];
}

/** resolveView 在途时 UI 的占位态（计划 4 用它起骨架，避免首屏闪登录页） */
export const CHECKING_STATE: AdminState = { view: "checking", login: "", avatarUrl: "", scope: "", hint: "" };

/** 占位值不可用：空串与纯空白都算「没配」，此时任何函数都不该发请求 */
export function missingClientId(config?: ConfigLike) {
  return !String(config?.oauthClientId ?? "").trim();
}

/** 视图判定唯一入口：读会话 → 本地过期闸 → `/user` 取真实身份 → allowlist 比对。
 *  身份只信 `/user`，不信会话里自报的 login（会话躺在用户自己的 storage 里，改一行就能换个名字显示）。
 *  `/user` 的 403/5xx 不吞：那是「读不了」而不是「没登录」，清会话会把限流伪装成登出——原样抛给上层分类。 */
export async function resolveView({
  config,
  storage,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}: {
  config: ConfigLike;
  storage: StorageLike;
  fetchImpl?: Fetch;
  now?: () => number;
}): Promise<AdminState> {
  if (missingClientId(config))
    return {
      view: "unconfigured",
      login: "",
      avatarUrl: "",
      scope: "",
      hint: "后台未配置 oauthClientId：先在 config/site-config.json 填入 OAuth App 的 client_id 并提交（这是公开值，Device Flow 不需要 client secret）",
    };
  const s = readSession(storage);
  if (!s) return { view: "login", login: "", avatarUrl: "", scope: "", hint: "" };
  if (sessionVerdict(s, now()) === "expired") {
    clearSession(storage);
    return { view: "expired", login: s.login, avatarUrl: s.avatarUrl, scope: s.scope, hint: "登录凭证已过期：请重新完成 Device Flow 登录" };
  }
  const who = (await fetchUserLogin({ token: s.token, fetchImpl })) as { kind: string; login?: string; avatarUrl?: string };
  if (who.kind === "unauthorized") {
    clearSession(storage);
    return { view: "expired", login: s.login, avatarUrl: "", scope: s.scope, hint: "GitHub 已拒绝该凭证（401）：请重新完成 Device Flow 登录" };
  }
  const login = typeof who.login === "string" ? who.login : "";
  const avatarUrl = typeof who.avatarUrl === "string" ? who.avatarUrl : "";
  const verdict = allowlistCheck({ login, logins: config.adminLogins });
  if (!verdict.ok) return { view: "denied", login, avatarUrl, scope: s.scope, hint: denyNote(verdict) };
  saveSession(storage, { ...s, login, avatarUrl }); // 身份回写：顶栏不必再打第二次 /user
  return { view: "ready", login, avatarUrl, scope: s.scope, hint: "" };
}

/** 发起 Device Flow：展示字段原样透传——user_code 是给人抄到 github.com/login/device 的，
 *  本层加任何格式化（大写、换分隔符）都会导致抄错。 */
export async function startLogin({ config, fetchImpl = globalThis.fetch }: { config: ConfigLike; fetchImpl?: Fetch }) {
  if (missingClientId(config))
    throw new Error("未配置 oauthClientId：先在 config/site-config.json 填入 OAuth App 的 client_id 并提交，后台不该发请求");
  return requestDeviceCode({ clientId: String(config.oauthClientId).trim(), fetchImpl });
}

const sleepDefault = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface WaitDeps {
  clientId: string;
  deviceCode: string;
  interval: number; // 秒：来自 requestDeviceCode 应答，是 GitHub 强制的节奏
  expiresIn: number; // 秒：设备码有效期，同时当轮询总闸
  storage?: StorageLike; // 给了才落会话
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type WaitResult =
  | { kind: "token"; token: string; scope: string; polls: number }
  | { kind: "access_denied"; polls: number }
  | { kind: "expired"; polls: number }
  | { kind: "fatal"; error: string; message: string; polls: number }
  | { kind: "timeout"; polls: number };

/** 轮询到终态为止。deadline＝起始时刻 + 设备码有效期：页面没关时这段循环就是死循环，必须有出口。
 *  只有 authorization_pending / slow_down 才继续等（slow_down 按文档 +5s）；
 *  其余 error（如 incorrect_client_credentials）再等也不会变，立刻 fatal 收手并带上原因。 */
export async function waitLogin(p: WaitDeps): Promise<WaitResult> {
  const { clientId, deviceCode, storage, fetchImpl = globalThis.fetch, sleep = sleepDefault, now = () => Date.now() } = p;
  let interval = Math.max(1, Number(p.interval) || 5);
  const deadline = now() + Math.max(60, Number(p.expiresIn) || 900) * 1000;
  let polls = 0;
  for (;;) {
    if (now() >= deadline) return { kind: "timeout", polls };
    const r = (await pollDeviceToken({ clientId, deviceCode, fetchImpl })) as {
      kind: string;
      token?: string;
      scope?: string;
      expiresIn?: number;
      message?: string;
    };
    polls += 1;
    if (r.kind === "token") {
      const session: AdminSession = {
        token: String(r.token ?? ""),
        login: "", // 身份只由 resolveView 的 /user 回写，登录成功时不自我声明
        avatarUrl: "",
        scope: String(r.scope ?? ""),
        expiresAt: r.expiresIn ? now() + Number(r.expiresIn) * 1000 : 0,
      };
      if (storage) saveSession(storage, session);
      return { kind: "token", token: session.token, scope: session.scope, polls };
    }
    if (r.kind === "access_denied") return { kind: "access_denied", polls };
    if (r.kind === "expired_token") return { kind: "expired", polls };
    if (r.kind === "slow_down") interval += 5;
    else if (r.kind !== "authorization_pending") return { kind: "fatal", error: r.kind, message: String(r.message ?? ""), polls };
    await sleep(interval * 1000);
  }
}

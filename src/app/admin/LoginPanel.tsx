import type { AdminState, AdminView } from "@/lib/admin/auth";
import { loginCopy, NO_REPO_NOTE, pollingNote } from "@/lib/admin/uiModel";

/** 设备码的展示面：只有 userCode 与 verificationUri 给人看，deviceCode 留给轮询（别渲出去，它更长也更敏感） */
export interface DeviceFlowView {
  userCode: string;
  verificationUri: string;
}

/** 登录/引导区：五种「还没进去」的形态共用一套版式，差别只在文案与按钮是否可用。
 *  blocked（clientIdMissing 或没有 repo）必须先把请求禁掉再解释原因——放一个能点的按钮过去，
 *  点下去是一句「登录请求失败：…404」，那比不点更难懂。 */
export default function LoginPanel({
  view,
  repo,
  clientIdMissing,
  flow,
  polling,
  onStart,
}: {
  view: AdminState;
  repo: string;
  clientIdMissing: boolean;
  flow: DeviceFlowView | null;
  polling: { interval: number } | null;
  onStart: () => void;
}) {
  /** checking 期间 config 还没读回来，repo/clientIdMissing 都还是初始值——
   *  此时禁按钮是对的，把它渲成「未配置」是错的：那是把「还没读」说成「没有」。 */
  const checking = view.view === "checking";
  const blocked = !checking && (clientIdMissing || !repo);
  const mode: AdminView | "noRepo" = blocked && view.view === "login" ? (clientIdMissing ? "unconfigured" : "noRepo") : view.view;
  const copy = loginCopy(mode);
  return (
    <main className="adm-body" id="main">
      <div className="adm-card adm-login">
        <h1 style={{ fontSize: "26px", margin: "8px 0 4px", fontFamily: "var(--font-serif)" }}>{copy.heading}</h1>
        <p className="adm-meta">{copy.note}</p>
        {blocked ? (
          <>
            <p className="adm-statebar bad" role="alert">
              {clientIdMissing ? view.hint || copy.note : NO_REPO_NOTE}
            </p>
            <button type="button" className="btn-primary" disabled>
              发起 Device Flow 登录
            </button>
          </>
        ) : checking ? (
          <p className="adm-statebar info" role="status">
            ⟳ 正在核对本地会话与 GitHub 身份…
          </p>
        ) : (
          <ol className="adm-flow">
            <li data-n="1">
              <div>
                {flow ? (
                  <a className="adm-mono" href={flow.verificationUri} target="_blank" rel="noreferrer">
                    {flow.verificationUri}
                  </a>
                ) : (
                  <b className="adm-mono">github.com/login/device</b>
                )}
              </div>
            </li>
            <li data-n="2">
              <div>
                {flow ? <div className="adm-code">{flow.userCode}</div> : "输入下方一次性代码"}
                <div className="adm-hint">代码 15 分钟内有效，本页自动轮询授权结果（节奏由 GitHub 的 interval 决定）。</div>
              </div>
            </li>
            <li data-n="3">
              <div>
                {flow ? (
                  <span className="adm-meta">已发起，等待你在 GitHub 侧确认。</span>
                ) : (
                  <button type="button" className="btn-primary" onClick={onStart}>
                    发起 Device Flow 登录
                  </button>
                )}
              </div>
            </li>
          </ol>
        )}
        {polling ? (
          <p className="adm-statebar info" role="status" style={{ margin: "12px 0 0" }}>
            {pollingNote(polling.interval)}
          </p>
        ) : null}
        {view.hint && !blocked && !checking ? <p className="adm-statebar warn">{view.hint}</p> : null}
      </div>
    </main>
  );
}

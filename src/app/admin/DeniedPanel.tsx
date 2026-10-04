import type { AdminState } from "@/lib/admin/auth";
import { pageHref } from "@/lib/href";
import { deniedText } from "@/lib/admin/uiModel";

/** 白名单拒绝页：身份是真的（resolveView 刚从 /user 取回），只是不在名单上。
 *  措辞不许写成「登录失败」——那会让人反复重登而不去找站长。 */
export default function DeniedPanel({ state }: { state: AdminState }) {
  const copy = deniedText(state.login, state.hint);
  return (
    <main className="adm-body" id="main">
      <div className="adm-nf">
        <div className="adm-stampbox">
          <div className="stamp" aria-hidden="true">
            <span className="stamp-inner">
              <strong>未授权</strong>
              <em>403</em>
            </span>
          </div>
        </div>
        <h1>{copy.heading}</h1>
        <p>
          GitHub login <b className="adm-mono">@{copy.login || "（未取得）"}</b> 不在 <code>adminLogins</code> 白名单内。
        </p>
        <p className="adm-why">{copy.note}</p>
        <a className="btn-ghost" href={pageHref("/")}>
          返回头版
        </a>
      </div>
    </main>
  );
}

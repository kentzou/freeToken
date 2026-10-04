import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { AdminState } from "@/lib/admin/auth";
import { pageHref } from "@/lib/href";
import { TABS, paneAria, pendingBadge, tabAria } from "@/lib/admin/tabs";
import type { TabKey } from "@/lib/admin/tabs";
import { expiredBarText } from "@/lib/admin/uiModel";

/** 已登录外壳：顶栏（复用 .shell-top）、过期黄条、tablist、当前面板。
 *  面板内容作为 children 注入——四个 pane 因此不必互相认识（Task 7/10/11/12 各自独立可测）。 */
export default function Workbench({
  state,
  active,
  focusKey,
  pendingCount,
  onTab,
  onKey,
  onLogout,
  children,
}: {
  state: AdminState;
  active: TabKey;
  focusKey: TabKey;
  pendingCount: number;
  onTab: (key: TabKey) => void;
  onKey: (e: ReactKeyboardEvent) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const badge = pendingBadge(pendingCount);
  return (
    <>
      <div className="shell-top adm-top">
        {state.view === "expired" ? (
          <p className="adm-statebar warn" role="status">
            {expiredBarText(state.hint)}
          </p>
        ) : null}
        <a className="shell-brand" href={pageHref("/")}>
          <span className="shell-avatar" aria-hidden="true">
            T
          </span>
          Token 情报局 · 值班室
        </a>
        <div className="adm-who">
          {state.avatarUrl ? <img src={state.avatarUrl} alt="" width={26} height={26} /> : <span className="shell-avatar" aria-hidden="true">{(state.login || "?").slice(0, 1)}</span>}
          <span className="adm-mono">@{state.login}</span>
          <button type="button" className="btn-ghost" onClick={onLogout} style={{ minHeight: 32, padding: "2px 12px", fontSize: 12 }}>
            退出登录
          </button>
        </div>
      </div>
      <main className="adm-body" id="main">
        <nav className="adm-tabs" role="tablist" aria-label="后台功能" onKeyDown={onKey}>
          {TABS.map((t) => (
            <button key={t.key} type="button" {...tabAria(t.key, active, focusKey)} onFocus={() => onTab(t.key)}>
              {t.label}
              {t.key === "review" && badge ? <span className="n">{badge}</span> : null}
            </button>
          ))}
        </nav>
        {TABS.map((t) => (
          <section key={t.key} {...paneAria(t.key, active)}>
            {t.key === active ? children : null}
          </section>
        ))}
      </main>
    </>
  );
}

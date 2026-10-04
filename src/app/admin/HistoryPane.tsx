/** Tab4「发布历史」：crawl.yml 的 workflow runs ＋ 门禁说明。
 *  本文件只讲布局：四支怎么说来自 uiModel.historyView，每行怎么写来自 historyRow（§1 红线 1），
 *  错误条与空态的结构在 PaneAtoms（第三处同形就该并进原子层，Tab1/Tab2 已经先并过一次）。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isAuthError } from "@/lib/admin/errors";
import { loadRuns } from "@/lib/admin/runs";
import type { RunsResult } from "@/lib/admin/runs";
import { EMPTY_HISTORY, HISTORY_GATE_NOTE, HISTORY_HEAD, historyView } from "@/lib/admin/uiModel";
import type { HistoryViewState } from "@/lib/admin/uiModel";
import type { PaneCtx } from "./AdminApp";
import { EmptyNotice, ErrorNotice } from "./PaneAtoms";

/** D9：transport 在本 pane 只出现这一行，数据面调用把它当实参显式传下去。 */
const FETCH = globalThis.fetch.bind(globalThis);

export interface HistoryTableProps {
  view: HistoryViewState;
  busy: boolean;
  onReload: () => void;
}

/** 五列一一对应 HISTORY_HEAD：编号挂外链、状态用 adm-badge 的三档（色档来自 historyRow.badgeTone，
 *  组件绝不自己按 conclusion 重算），耗时与时间走等宽。第 4 列就是 @media 隐藏的那一列，别改序。 */
export function HistoryTable({ view, busy, onReload }: HistoryTableProps) {
  return (
    <div className="adm-card" aria-busy={busy}>
      {view.kind === "loading" ? <p className="adm-why">{view.text}</p> : null}
      {view.kind === "error" ? <ErrorNotice bar={view.bar} busy={busy} onReload={onReload} /> : null}
      {view.kind === "empty" ? (
        <EmptyNotice
          stamp={EMPTY_HISTORY.stamp}
          heading={EMPTY_HISTORY.heading}
          note={EMPTY_HISTORY.note}
          footer={<p className="adm-why">{HISTORY_GATE_NOTE}</p>}
        />
      ) : null}
      {view.kind === "list" ? (
        <>
          <h3>{view.caption}</h3>
          <table className="adm-hist">
            <thead>
              <tr>
                {HISTORY_HEAD.map((head) => (
                  <th key={head} scope="col">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.runNumber}>
                  <td className="adm-mono">
                    {row.htmlUrl ? (
                      <a href={row.htmlUrl} target="_blank" rel="noreferrer">
                        {row.runNumber}
                      </a>
                    ) : (
                      row.runNumber
                    )}
                  </td>
                  <td>{row.event}</td>
                  <td>
                    <span className={`adm-badge ${row.badgeTone}`}>{row.badgeText}</span>
                  </td>
                  <td className="adm-mono">{row.duration}</td>
                  <td className="adm-mono">{row.clock}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="adm-why">{HISTORY_GATE_NOTE}</p>
        </>
      ) : null}
    </div>
  );
}

export default function HistoryPane({ ctx }: { ctx: PaneCtx }) {
  const { repo, token } = ctx;
  const [res, setRes] = useState<RunsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const sink = useRef({ onExpired: ctx.onExpired });
  sink.current = { onExpired: ctx.onExpired };

  /** perPage 取 5：这一格是「最近几次」的档案面，Tab3 的徽标只吃 1 条，各取所需，
   *  不共用一个「反正都要读」的大数——GitHub 的配额按请求数计。 */
  const read = useCallback(async () => {
    setBusy(true);
    try {
      const next = await loadRuns(repo, { token, perPage: 5, fetchImpl: FETCH });
      /** 401 才算会话已死（isAuthError 是 errors.ts 那条口径的唯一出口）；403 只是 scope 不够，
       *  清会话会把「没给 Actions:read」伪装成「你登出了」，所以那种情况只出错误条。 */
      if (next.kind === "error" && isAuthError(next)) sink.current.onExpired(next.message);
      setRes(next);
    } finally {
      setBusy(false);
    }
  }, [repo, token]);

  const booted = useRef("");
  useEffect(() => {
    const key = `${repo}|${token}`;
    if (booted.current === key) return;
    booted.current = key;
    void read();
  }, [read, repo, token]);

  return <HistoryTable view={historyView(res)} busy={busy} onReload={() => void read()} />;
}

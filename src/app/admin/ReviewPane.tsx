/** Tab1「待审变更」：并发读队列与审核 Issue → 四支分流 → 盖章发布。
 *  本文件只讲布局：每一种状态该说什么，全部来自 uiModel（§1 红线 1，测试里有一条静态钉在盯这件事）。
 *  不加 "use client"：Task 6 起 AdminApp 是后台唯一的客户端边界，pane 随它进客户端图。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { classifyError } from "@/lib/admin/errors";
import { loadReviewContext, toRows } from "@/lib/admin/pending";
import type { ChangeRow, PendingJson, ReviewContext } from "@/lib/admin/pending";
import { publishApprovals } from "@/lib/admin/publish";
import type { Decision } from "@/lib/admin/publish";
import {
  EMPTY_REVIEW,
  ISSUE_LINK_LABEL,
  REJECT_LABEL,
  RETRY_BUTTON,
  WHOLE_ABSENT,
  WHOLE_CAPTION,
  actionLabel,
  approveAllLabel,
  extraFieldsNote,
  publishCrash,
  publishReceipt,
  reviewView,
  rowKindLabel,
  staleNote,
  stampMini,
} from "@/lib/admin/uiModel";
import type { Receipt, ReviewViewState } from "@/lib/admin/uiModel";
import type { PaneCtx } from "./AdminApp";
import { EmptyNotice, ErrorNotice, ReceiptBar } from "./PaneAtoms";

/** D9：transport 在 pane 里只出现这一行，且每个数据面调用都把它当实参显式传下去。
 *  各 pane 自备一行而不由 AdminApp 下发，是为了让「src/app/admin 里除这行以外没有任何 fetch」
 *  成为可以 grep 的事实（§1 红线 3 的三条扫描）。bind 的理由与 AdminApp 逐字相同。 */
const FETCH = globalThis.fetch.bind(globalThis);

function ChangeCard({ row, stamp, busy, onDecide }: { row: ChangeRow; stamp: Decision["action"] | undefined; busy: boolean; onDecide: (row: ChangeRow, action: Decision["action"]) => void }) {
  /** 盖过章的行收起整组按钮：指令是对 Issue 复述一遍，重复点＝重复发一遍，比不点更糟 */
  if (stamp)
    return (
      <article className="adm-card">
        <h3>{row.name}</h3>
        <p className="adm-why">{rowKindLabel(row)}</p>
        <span className="adm-stamp-mini">{stampMini(stamp === "approve")}</span>
      </article>
    );
  return (
    <article className="adm-card">
      <h3>{row.name}</h3>
      <p className="adm-why">
        <span className={`adm-kind ${row.removal ? "del" : "mod"}`}>{rowKindLabel(row)}</span>
      </p>
      {row.whole ? (
        <>
          <p className="adm-why">{WHOLE_CAPTION}</p>
          {row.beforeText ? <pre>{row.beforeText}</pre> : <p className="adm-why">{WHOLE_ABSENT}</p>}
          {row.afterText ? <pre>{row.afterText}</pre> : <p className="adm-why">{WHOLE_ABSENT}</p>}
        </>
      ) : (
        <table className="adm-diff">
          <tbody>
            {row.fields.map((f) => (
              <tr key={f.field}>
                <th scope="row">{f.field}</th>
                <td className="del">{f.from}</td>
                <td className="add">{f.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {row.extraFields > 0 ? <p className="adm-why">{extraFieldsNote(row.extraFields)}</p> : null}
      <div className="adm-acts">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onDecide(row, "approve")}>
          {actionLabel(row)}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => onDecide(row, "reject")}>
          {REJECT_LABEL}
        </button>
      </div>
    </article>
  );
}

export interface ReviewListProps {
  view: ReviewViewState;
  busy: boolean;
  receipt: Receipt | null;
  stamped: Record<string, Decision["action"]>;
  /** 可选：list 支之外没有它的位置，而 Task 4 与本任务的用例都直接构造 list 字面量——
   *  设为必填会让那些用例凭空多传一个空串，等于把「有没有 Issue」这件事交给调用方记。 */
  issueUrl?: string;
  onDecide: (row: ChangeRow, action: Decision["action"]) => void;
  onApproveAll: () => void;
  onReload: () => void;
}

/** 纯组件：给定视图事实渲页面。renderToStaticMarkup 不跑事件循环，
 *  所以能测的全在这儿，容器那一层的每句话都由 reviewView + 本组件代答。 */
export function ReviewList({ view, busy, receipt, stamped, issueUrl, onDecide, onApproveAll, onReload }: ReviewListProps) {
  if (view.kind === "loading")
    return (
      <div aria-busy={busy}>
        <ReceiptBar receipt={receipt} />
        <div className="adm-card" role="status">
          <p className="adm-why">{view.text}</p>
          <p className="adm-skeleton" />
          <p className="adm-skeleton" style={{ width: "62%" }} />
        </div>
      </div>
    );

  if (view.kind === "empty")
    return (
      <div aria-busy={busy}>
        <ReceiptBar receipt={receipt} />
        <EmptyNotice
          stamp={EMPTY_REVIEW.stamp}
          heading={EMPTY_REVIEW.heading}
          note={EMPTY_REVIEW.note}
          footer={
            <p className="adm-count">
              待审变更 <span className="n">0</span>
            </p>
          }
        />
      </div>
    );

  if (view.kind === "error")
    return (
      <div aria-busy={busy}>
        <ReceiptBar receipt={receipt} />
        <ErrorNotice bar={view.bar} busy={busy} onReload={onReload} />
      </div>
    );

  const undecided = view.rows.filter((r) => !stamped[r.id]);
  return (
    <div aria-busy={busy}>
      <ReceiptBar receipt={receipt} />
      <p className="adm-note">
        {view.source}
        {issueUrl ? (
          <>
            {" · "}
            <a href={issueUrl} target="_blank" rel="noreferrer">
              {ISSUE_LINK_LABEL}
            </a>
          </>
        ) : null}
      </p>
      <p className="adm-why">{view.note}</p>
      {view.rows.map((row) => (
        <ChangeCard key={row.id} row={row} stamp={stamped[row.id]} busy={busy} onDecide={onDecide} />
      ))}
      <div className="adm-acts">
        <button type="button" className="btn-primary" disabled={busy || undecided.length === 0} onClick={onApproveAll}>
          {approveAllLabel(undecided.length)}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onReload}>
          {RETRY_BUTTON}
        </button>
      </div>
    </div>
  );
}

export default function ReviewPane({ ctx, onCount }: { ctx: PaneCtx; onCount: (n: number) => void }) {
  const { repo, token } = ctx;
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [stamped, setStamped] = useState<Record<string, Decision["action"]>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  /** 回调走 ref 而不是依赖：ctx 里的 onExpired 会随 AdminApp 的 state/config 变化换引用，
   *  把它放进 effect 依赖就变成「外壳每渲一次、GitHub 多挨一次读」。
   *  渲染期写 ref 是幂等赋值（StrictMode 双渲写的是同一个值），比再开一个 effect 来同步更直白。 */
  const sink = useRef({ onExpired: ctx.onExpired, onCount });
  sink.current = { onExpired: ctx.onExpired, onCount };

  /** 返回「重读回来的行」而不是 void：调用方要拿它和写面报的条数比，才知道这期间有没有别人插过一手 */
  const reload = useCallback(async (): Promise<ChangeRow[]> => {
    const c = await loadReviewContext({ repo, token, fetchImpl: FETCH });
    const next = c.pending.kind === "loaded" ? toRows(c.pending.pending) : [];
    setContext(c);
    setRows(next);
    sink.current.onCount(next.length);
    if (c.authFailed) sink.current.onExpired(c.pending.kind === "error" ? c.pending.message : c.issueNote);
    return next;
  }, [repo, token]);

  /** 与 AdminApp 的 booted 闸同一理由：reactStrictMode 会把 effect 调两遍，真接口双跑白耗限流额度。
   *  键取 repo|token——换身份（重新登录）必须能再读一次，所以不能只判「读过没有」。 */
  const booted = useRef("");
  useEffect(() => {
    const key = `${repo}|${token}`;
    if (booted.current === key) return;
    booted.current = key;
    void reload();
  }, [reload, repo, token]);

  const stamp = useCallback(
    async (decisions: Decision[]) => {
      if (!decisions.length || busy) return;
      setBusy(true);
      setReceipt(null);
      try {
        /** 队列与快照要么都有、要么都没有：kind 不是 loaded 时没有队列可盖（同一次读的产物，不许只传一半） */
        const loaded = context && context.pending.kind === "loaded" ? context.pending : null;
        const pending: PendingJson | null = loaded ? loaded.pending : null;
        const pendingCurrent = loaded ? { text: loaded.text, sha: loaded.sha } : null;
        const res = await publishApprovals({
          repo,
          token,
          login: ctx.login,
          adminLogins: ctx.config?.adminLogins ?? [],
          pending,
          pendingCurrent,
          issueNumber: context?.issueNumber ?? 0,
          decisions,
          fetchImpl: FETCH,
        });
        let out = publishReceipt(res);
        if (res.kind === "published") {
          const done: Record<string, Decision["action"]> = {};
          for (const d of res.applied) done[d.id] = d.action;
          setStamped((prev) => ({ ...prev, ...done }));
          /** 只有写面全绿的那一次才值得比对条数：有文件没提交时回执自己已经列明了它们，
           *  再补一句「页面 x 条 / 远端 y 条」是把同一件事说两遍。 */
          if (!res.failed.length) {
            const left = await reload();
            const note = staleNote(res.pendingLeft, left.length);
            if (note) out = { ...out, lines: [...out.lines, note] };
          }
        }
        setReceipt(out);
      } catch (e) {
        const c = classifyError(e);
        setReceipt(publishCrash(c.message, c.hint));
        if (c.kind === "auth") ctx.onExpired(c.message);
      } finally {
        setBusy(false);
      }
    },
    [busy, context, ctx, reload, repo, token],
  );

  const onDecide = useCallback((row: ChangeRow, action: Decision["action"]) => void stamp([{ action, id: row.id }]), [stamp]);
  const onApproveAll = useCallback(
    () => void stamp(rows.filter((r) => !stamped[r.id]).map((r) => ({ action: "approve" as const, id: r.id }))),
    [rows, stamp, stamped],
  );

  return (
    <ReviewList
      view={reviewView(context, rows)}
      busy={busy}
      receipt={receipt}
      stamped={stamped}
      issueUrl={context?.issueUrl}
      onDecide={onDecide}
      onApproveAll={onApproveAll}
      onReload={() => void reload()}
    />
  );
}

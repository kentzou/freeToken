/** Tab3「触发爬取」：一次 POST ＋ 前后各一次 runs 对照。
 *  本文件只讲布局：三态怎么说来自 uiModel.triggerReceipt，小徽标怎么说来自 lastRunNote（§1 红线 1）。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isAuthError } from "@/lib/admin/errors";
import { loadRuns } from "@/lib/admin/runs";
import type { RunsResult } from "@/lib/admin/runs";
import { triggerCrawl } from "@/lib/admin/trigger";
import {
  CRAWL_READER_NOTE,
  RETRY_BUTTON,
  TRIGGER_BUTTON,
  lastRunNote,
  triggerReceipt,
} from "@/lib/admin/uiModel";
import type { Receipt } from "@/lib/admin/uiModel";
import type { PaneCtx } from "./AdminApp";
import { ReceiptBar } from "./PaneAtoms";

/** D9：transport 在本 pane 只出现这一行，每次数据面调用都把它显式当实参传下去（§1 红线 3）。 */
const FETCH = globalThis.fetch.bind(globalThis);

/** 徽标只在读失败时才多出一个按钮：常驻一颗「重新读取」会让人以为徽标本来就是会自己刷新的，
 *  而出问题时它已经在眼前，反而没人为它解释过。失败态才出现，正好和「不影响触发」那句话配套。 */
export interface CrawlPanelProps {
  busy: boolean;
  runs: RunsResult | null;
  receipt: Receipt | null;
  onTrigger: () => void;
  onReload: () => void;
}

export function CrawlPanel({ busy, runs, receipt, onTrigger, onReload }: CrawlPanelProps) {
  const badge = lastRunNote(runs);
  const failed = runs !== null && runs.kind === "error";
  return (
    <div aria-busy={busy}>
      <ReceiptBar receipt={receipt} />
      <div className="adm-card">
        <h3>手动触发一次爬取</h3>
        <p className="adm-meta">
          等价于 GitHub Actions 的 <code className="adm-mono">workflow_dispatch</code>：给{" "}
          <code className="adm-mono">crawl.yml</code> 排一次队。
        </p>
        <div className="adm-crawl">
          <button type="button" className="btn-primary" disabled={busy} aria-busy={busy} onClick={onTrigger}>
            {TRIGGER_BUTTON}
          </button>
          <span className={badge.className}>{badge.text}</span>
          {failed ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={onReload}>
              {RETRY_BUTTON}
            </button>
          ) : null}
          <p className="adm-why">{CRAWL_READER_NOTE}</p>
        </div>
      </div>
    </div>
  );
}

export default function CrawlPane({ ctx }: { ctx: PaneCtx }) {
  const { repo, token } = ctx;
  const [runs, setRuns] = useState<RunsResult | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const sink = useRef({ onExpired: ctx.onExpired });
  sink.current = { onExpired: ctx.onExpired };

  /** perPage 取 1：徽标只要最新那一条，Tab4 才需要 5 条。GitHub 的配额按请求数计，
   *  顺手多拿四条不是「反正都读过」，是每次进这一格多挨四次。 */
  const readBadge = useCallback(async () => {
    setRuns(await loadRuns(repo, { token, perPage: 1, fetchImpl: FETCH }));
  }, [repo, token]);

  const booted = useRef("");
  useEffect(() => {
    const key = `${repo}|${token}`;
    if (booted.current === key) return;
    booted.current = key;
    void readBadge();
  }, [readBadge]);

  /** 这里没有 catch：triggerCrawl 与 loadRuns 自己把抛错折成了判别联合（runs.ts 顶部立层的原因），
   *  组件再包一层 catch 等于给一条不存在的路修灯。finally 是必须的——busy 卡在 true 就是永久禁用。 */
  const onTrigger = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setReceipt(null);
    try {
      const res = await triggerCrawl(repo, { token, fetchImpl: FETCH });
      setReceipt(triggerReceipt(res));
      /** 401 才算会话已死，判据不在这里写数字：isAuthError 是 errors.ts 那条口径的唯一出口，
       *  403（缺 Actions:write）清会话会把「scope 没给够」伪装成「你登出了」。 */
      if (res.kind === "error" && isAuthError(res)) sink.current.onExpired(res.message);
      await readBadge(); // 触发完顺手重读：让「上次运行」跟着动，而不是停在点之前的旧值
    } finally {
      setBusy(false);
    }
  }, [busy, readBadge, repo, token]);

  return (
    <CrawlPanel busy={busy} runs={runs} receipt={receipt} onTrigger={() => void onTrigger()} onReload={() => void readBadge()} />
  );
}

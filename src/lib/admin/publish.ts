/** /admin Tab1「批准并发布」的唯一通路：白名单闸 → 生成指令 → runReview → 逐文件 Contents 提交。
 *  两条硬约束：
 *  ① 不自己调 applyDecisions——后台与 CI 的 review job 必须共用 `crawler/review.mjs`，否则
 *     「批准并发布」会长出两种语义（校验时机、回执措辞、pending 清理全部分叉）。
 *  ② 白名单在这里再核一次，与 resolveView 的入口门禁各自独立：入口挡的是「不该进后台的人」，
 *     这里挡的是「进了后台也不该盖章的会话」——token 躺在用户自己的 storage 里，改一行就能换个名字显示。 */
import { allowlistCheck, denyNote } from "../../../crawler/allowlist.mjs";
import { commandText, runReview } from "../../../crawler/review.mjs";
import { dump } from "../../../crawler/serialize.mjs";
import { classifyError } from "./errors";
import { commitText, DATA_PATHS, loadCurrentData } from "./remote";
import type { PendingJson } from "./pending";

type Fetch = (url: any, init?: any) => Promise<any>;

export interface Decision {
  action: "approve" | "reject";
  id: string;
}

export type PublishResult =
  | { kind: "denied"; hint: string }
  | { kind: "noop"; hint: string }
  | {
      kind: "published";
      applied: Decision[];
      missing: string[];
      pendingLeft: number;
      committed: string[];
      unchanged: string[];
      failed: { path: string; hint: string }[];
    };

export interface PublishDeps {
  repo: string;
  token: string;
  /** 身份只信 resolveView 从 `/user` 取回的那个 login，不信会话里自报的 */
  login: string;
  adminLogins: string[];
  pending: PendingJson | null;
  /** 0＝当前没有开放的审核 Issue：runReview 会跳过回执与关单，写面照常 */
  issueNumber: number;
  decisions: Decision[];
  message?: string;
  fetchImpl?: Fetch;
}

export async function publishApprovals({
  repo,
  token,
  login,
  adminLogins,
  pending,
  issueNumber,
  decisions,
  message = "chore(admin): 审批合入",
  fetchImpl = globalThis.fetch,
}: PublishDeps): Promise<PublishResult> {
  const gate = allowlistCheck({ login, logins: adminLogins });
  if (!gate.ok) return { kind: "denied", hint: denyNote(gate) };
  if (!decisions.length) return { kind: "noop", hint: "一条也没选中：没有指令要发给 Issue，也不会写任何文件" };

  const cur = await loadCurrentData(repo, { token, fetchImpl });
  /* current 用 dump(现值) 而不是远端原文：三条产出都 dump 稳定（Task 1 实测），两者等价，
   * 而 dump(现值) 不会被「远端格式漂移」骗成一次纯格式重排的提交（commitText 的比对再写才准）。 */
  const byPath: Record<string, { text: string; sha: string }> = {};
  for (const [key, path] of Object.entries(DATA_PATHS)) {
    const table = (cur as unknown as Record<string, unknown>)[key];
    byPath[path] = { text: dump(table), sha: cur.shas[path] };
  }
  const committed: string[] = [];
  const unchanged: string[] = [];
  const failed: { path: string; hint: string }[] = [];

  const commit = async (files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      try {
        const r = (await commitText({ repo, path, text, message: `${message}（${path}）`, token, fetchImpl, current: byPath[path] })) as {
          kind: string;
        };
        (r.kind === "committed" ? committed : unchanged).push(path);
      } catch (e) {
        /* 单文件失败不中断后面的文件：失败的条目仍留在 pending 里，重试是幂等的
         * （commitText 比对再写，已提交的文件下一轮走 unchanged）。停在第一个错误反而让剩下的更旧。 */
        const c = classifyError(e);
        failed.push({ path, hint: `${c.hint}（HTTP ${c.status}）` });
      }
    }
  };

  const res = await runReview({
    repo,
    issueNumber,
    pending: pending ?? { version: 1, changes: [] },
    data: cur,
    comment: commandText(decisions),
    token,
    fetchImpl,
    commit,
  });
  return {
    kind: "published",
    applied: res.applied as Decision[],
    missing: res.missing,
    pendingLeft: res.pendingLeft,
    committed,
    unchanged,
    failed,
  };
}

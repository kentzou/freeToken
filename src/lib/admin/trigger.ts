/** Tab3「触发爬取」的唯一写面。GitHub 的 workflow_dispatch 只回 202 空应答、**不返回 run 号**，
 *  所以「到底排上了没有」只能靠前后各读一次 runs 对照——这不是仪式感：把 202 直接渲染成「爬取成功」，
 *  后台就会在 workflow 排队失败时谎报。
 *  两条硬规矩：① 前置读 401（凭证失效）时零 POST，不拿过期身份触发出站任务；
 *  ② 后置核对失败只降级成「已受理但未确认」（ok 态 + note），绝不折叠成 error——那会把已经发生的事
 *  说成没发生，逼人连点三次发三个爬取。
 *  效率事实（实测）：后置读撞 5xx 时 gh() 的 GET 退避是 1s/4s/10s，整条链路要占住 15005ms，
 *  所以计划 4 的触发按钮必须全程 aria-busy 禁用，不能让人以为卡死。 */
import { dispatchWorkflow, listWorkflowRuns } from "../../../crawler/github.mjs";
import { classifyError } from "./errors";
import { RUN_WORKFLOW } from "./runs"; // workflow 名与「发布历史」同源，常量只有一处

type Fetch = (url: any, init?: any) => Promise<any>;

export type TriggerResult =
  | { kind: "ok"; queued: boolean; note: string }
  | { kind: "error"; status: number; message: string; hint: string };

export async function triggerCrawl(
  repo: string,
  { token = "", ref = "main", fetchImpl = globalThis.fetch }: { token?: string; ref?: string; fetchImpl?: Fetch } = {},
): Promise<TriggerResult> {
  try {
    const before = await listWorkflowRuns(repo, RUN_WORKFLOW, { token, perPage: 1, fetchImpl });
    await dispatchWorkflow(repo, RUN_WORKFLOW, ref, { token, fetchImpl });
    let after: Record<string, any>[];
    try {
      after = await listWorkflowRuns(repo, RUN_WORKFLOW, { token, perPage: 1, fetchImpl });
    } catch (e) {
      return { kind: "ok", queued: false, note: `爬取已受理，但没能确认新 run（${classifyError(e).message}）：先去「发布历史」看一眼再决定要不要重发。` };
    }
    const beforeId = before.length ? before[0].id : null;
    const afterId = after.length ? after[0].id : null;
    if (afterId !== null && afterId !== beforeId) return { kind: "ok", queued: true, note: "" };
    return { kind: "ok", queued: false, note: "爬取已受理（GitHub 只回 202，不返回 run 号），这次没看到新 run：稍后刷新「发布历史」，别重复点击。" };
  } catch (e) {
    const c = classifyError(e); // 前置读与 POST 的失败都归这里：status/note 由 crawler 层挂好，本层不 regex
    return { kind: "error", status: c.status, message: c.message, hint: c.hint };
  }
}

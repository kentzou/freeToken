/** Tab4「发布历史」的运行时读（2026-09-30 更正：本注释原文写 Tab3，四标签定序后发布历史是第四格，
 *  消费方是 src/app/admin/HistoryPane.tsx，见计划 5 Task 11）。字段映射不在这里——crawler/github.mjs 的 listWorkflowRuns 已把
 *  run_number/durationMs 等算成展示事实（Task 2 已钉），本层只负责把「抛异常」翻译成判别联合。
 *  为什么值得单列一层：UI 必须区分「一条都没有」（空档案文案）与「读不到」（黄条重试），
 *  让组件各自 try/catch 会把后者渲染成前者——那是把故障说成「上游还没跑过」。 */
import { listWorkflowRuns } from "../../../crawler/github.mjs";
import { classifyError } from "./errors";

type Fetch = (url: any, init?: any) => Promise<any>;

/** 后台盯的是 crawl.yml（数据产出链路），deploy.yml 由 push paths 自动接力，不必在 UI 上追 */
export const RUN_WORKFLOW = "crawl.yml";

export type RunsResult = { kind: "ok"; runs: Record<string, any>[] } | { kind: "error"; status: number; message: string; hint: string };

export async function loadRuns(
  repo: string,
  { token = "", perPage = 5, fetchImpl = globalThis.fetch }: { token?: string; perPage?: number; fetchImpl?: Fetch } = {},
): Promise<RunsResult> {
  try {
    return { kind: "ok", runs: (await listWorkflowRuns(repo, RUN_WORKFLOW, { token, perPage, fetchImpl })) as Record<string, any>[] };
  } catch (e) {
    const c = classifyError(e); // 带 status 的 HTTP 错与裸 TypeError（断网/CORS）都从这里过，hint 单一出口
    return { kind: "error", status: c.status, message: c.message, hint: c.hint };
  }
}

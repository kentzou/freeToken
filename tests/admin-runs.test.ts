import { describe, expect, it } from "vitest";
import { loadRuns, RUN_WORKFLOW } from "@/lib/admin/runs";
import { hdr, mkFetch, res } from "./helpers/fake-fetch";

const row = (over: Record<string, unknown> = {}) => ({
  id: 412,
  run_number: 412,
  event: "schedule",
  status: "completed",
  conclusion: "success",
  created_at: "2026-09-29T12:00:00Z",
  updated_at: "2026-09-29T12:02:41Z",
  html_url: "https://github.com/o/r/actions/runs/412",
  ...over,
});
const envelope = (rows: unknown[]) => res(200, { total_count: rows.length, workflow_runs: rows });

describe("发布记录运行时读：Tab3「发布历史」的数据源（§0 裁决：runs 只在运行时 fetch）", () => {
  it("ok：默认只取最近 5 条，字段映射归 crawler 层（本层不重算）", async () => {
    const f = mkFetch(envelope([row(), row({ id: 413, run_number: 413, status: "in_progress", conclusion: null })]));
    const out = await loadRuns("o/r", { token: "ghu_x", fetchImpl: f.fn });
    expect(out.kind).toBe("ok");
    expect(f.calls.length).toBe(1);
    expect(f.calls[0].url).toBe(`https://api.github.com/repos/o/r/actions/workflows/${RUN_WORKFLOW}/runs?per_page=5`);
    expect(hdr(f.calls[0], "authorization")).toBe("Bearer ghu_x");
    expect((out as unknown as { runs: { id: number; status: string; durationMs: number | null }[] }).runs.map((r) => [r.id, r.status, r.durationMs])).toEqual([
      [412, "completed", 161000],
      [413, "in_progress", null],
    ]);
  });

  it("error：读不到就是读不到——403 绝不折成空列表（空列表会让 Tab3 显示「还没有跑过」）", async () => {
    const out = await loadRuns("o/r", { fetchImpl: mkFetch(res(403, { message: "API rate limit exceeded for 45.149.92.7." })).fn });
    expect(out.kind).toBe("error");
    expect((out as { hint: string }).hint).toContain("限流");
    expect((out as { message: string }).message).toContain("rate limit");
    expect("runs" in out).toBe(false);
  });
});

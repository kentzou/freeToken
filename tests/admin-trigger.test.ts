/** Tab3「触发爬取」的写面：payload 逐字段断言，真 POST 不在本机跑（§0 红线）。
 *  刻意不注入 5xx：gh() 对 GET 做 1s/4s/10s 三次退避重试，一次 5xx 用例要真等 15s（实测 15005ms）——
 *  那条路径改用 4xx（即答不重试）覆盖，5xx 的耗时事实记在本文件头与 Step 10 注释里，供计划 4 定 aria-busy。 */
import { describe, expect, it } from "vitest";
import { API } from "../crawler/github.mjs";
import { RUN_WORKFLOW } from "@/lib/admin/runs";
import { triggerCrawl } from "@/lib/admin/trigger";
import { hdr, mkFetch, res } from "./helpers/fake-fetch";

const runRow = (id: number, status = "in_progress") => ({
  id, run_number: id, event: "workflow_dispatch", status, conclusion: status === "completed" ? "success" : null,
  created_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:30Z", run_started_at: "2026-09-30T10:00:00Z",
  html_url: `https://github.com/o/r/actions/runs/${id}`,
});
const envelope = (rows: unknown[]) => ({ total_count: rows.length, workflow_runs: rows });
const seq = (calls: { init: Record<string, unknown> }[]) => calls.map((c) => (c.init.method as string) ?? "GET").join(",");
const runsUrl = `${API}/repos/o/r/actions/workflows/crawl.yml/runs?per_page=1`;
const post = (c: { url: string; init: Record<string, unknown> }) => c.url.endsWith("/dispatches") && c.init.method === "POST";

describe("triggerCrawl：workflow_dispatch 的受理与回执核对", () => {
  it("成功：前置读 → POST → 后置读（GET,POST,GET），payload 三处逐字段，新 run 号出现即 queued", async () => {
    const f = mkFetch(res(200, envelope([runRow(412)])), res(202, {}), res(200, envelope([runRow(413)])));
    const out = await triggerCrawl("o/r", { token: "ghu_x", fetchImpl: f.fn });
    expect(out).toEqual({ kind: "ok", queued: true, note: "" });
    expect(seq(f.calls)).toBe("GET,POST,GET");
    expect(f.calls[0].url).toBe(runsUrl); // per_page=1：只要最新一条做对照
    expect(f.calls[1].url).toBe(`${API}/repos/o/r/actions/workflows/crawl.yml/dispatches`);
    expect(f.calls[1].init.body).toBe(JSON.stringify({ ref: "main" })); // ref 进 body，不进 query
    expect(hdr(f.calls[1], "authorization")).toBe("Bearer ghu_x");
    expect(f.calls[2].url).toBe(runsUrl);
    expect(RUN_WORKFLOW).toBe("crawl.yml"); // 与「发布历史」同一个 workflow，常量只有一处
  });

  it("空历史首跑：前置读回空数组、后置读出现任意一条 → queued（没有对照 id 也不误判）", async () => {
    const f = mkFetch(res(200, envelope([])), res(202, {}), res(200, envelope([runRow(1)])));
    expect(((await triggerCrawl("o/r", { token: "t", fetchImpl: f.fn })) as { queued: boolean }).queued).toBe(true);
    const g = mkFetch(res(200, envelope([])), res(202, {}), res(200, envelope([])));
    expect(((await triggerCrawl("o/r", { token: "t", fetchImpl: g.fn })) as { queued: boolean }).queued).toBe(false);
  });

  it("403 缺 scope：error 态 + hint 点名 Actions:write，且不再发第三次 GET", async () => {
    const f = mkFetch(res(200, envelope([runRow(412)])), res(403, { message: "Resource not accessible by personal access token" }));
    const out = await triggerCrawl("o/r", { token: "t", fetchImpl: f.fn });
    expect(seq(f.calls)).toBe("GET,POST"); // POST 失败即止：重试无意义（§crawler/github.mjs gh()）
    expect(out.kind).toBe("error");
    expect((out as { status: number }).status).toBe(403);
    expect((out as { hint: string }).hint).toContain("触发爬取需 Actions:write");
    expect("queued" in out).toBe(false); // 错误态不得带成功字段
  });

  it("凭证失效：前置读 401 → 零 POST（绝不带着过期身份去触发出站任务）", async () => {
    const f = mkFetch(res(401, { message: "Bad credentials" }));
    const out = await triggerCrawl("o/r", { token: "t", fetchImpl: f.fn });
    expect(seq(f.calls)).toBe("GET");
    expect(f.calls.filter(post).length).toBe(0);
    expect((out as { hint: string }).hint).toContain("重新完成 Device Flow 登录");
  });

  it("202 之后两种「没能确认」都不谎报：同 id → queued false；后置读 403 → 仍是 ok 态不是 error", async () => {
    const same = await triggerCrawl("o/r", { token: "t", fetchImpl: mkFetch(res(200, envelope([runRow(412)])), res(202, {}), res(200, envelope([runRow(412)]))).fn });
    expect(same).toEqual({
      kind: "ok", queued: false,
      note: "爬取已受理（GitHub 只回 202，不返回 run 号），这次没看到新 run：稍后刷新「发布历史」，别重复点击。",
    });
    expect((same as { note: string }).note).not.toContain("成功");
    const bad = await triggerCrawl("o/r", { token: "t", fetchImpl: mkFetch(res(200, envelope([runRow(412)])), res(202, {}), res(403, { message: "Must have 'Actions: read' permission" })).fn });
    expect(bad.kind).toBe("ok"); // 已受理是事实，核对失败不能把已发生的事说成没发生
    expect((bad as { queued: boolean }).queued).toBe(false);
    expect((bad as { note: string }).note).toContain("Must have 'Actions: read' permission");
    expect((bad as { note: string }).note).not.toContain("未写入任何数据"); // 那句是 error 态的 hint，用在这里是谎报
  });

  /** §7-21 ②。本文件头那句「刻意不注入 5xx」到这里作废：接缝（triggerCrawl 的 sleep）现在有了，
   *  真等 15005ms 的代价归零，不再拿注释当免测凭据。 */
  it("后置读走满三次退避：仍报 ok/未确认，绝不折成 error（已经发生的事不能说成没发生）", async () => {
    const slept: number[] = [];
    const f = mkFetch(res(200, envelope([runRow(412)])), res(202, {}), res(500));
    const out = await triggerCrawl("o/r", {
      token: "ghu_x",
      fetchImpl: f.fn,
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(out).toMatchObject({ kind: "ok", queued: false });
    expect((out as { note: string }).note).toContain("没能确认新 run");
    expect((out as { note: string }).note).toContain("HTTP 500");
    expect(slept).toEqual([1000, 4000, 10000]);
    expect(seq(f.calls)).toBe("GET,POST,GET,GET,GET,GET"); // 后置读 1 发 + 3 次退避重发
  });

  it("前置读走满退避＝零 POST，且状态是 500 不是 0（0 会让界面说「未发出请求」，而它发了四次）", async () => {
    const slept: number[] = [];
    const f = mkFetch(res(500)); // 执行期 H1：单元素才粘得住 500（fake-fetch 是按序取、耗尽后才复用最后一条）
    const out = await triggerCrawl("o/r", {
      token: "ghu_x",
      fetchImpl: f.fn,
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(out).toMatchObject({ kind: "error", status: 500 });
    expect((out as { hint: string }).hint).toContain("GitHub 侧故障");
    expect(slept).toEqual([1000, 4000, 10000]);
    /** 读不到现状就不排站外任务：这条是 §3 决策 11 的「前置读 401 零 POST」在 5xx 侧的同款对照 */
    expect(f.calls.filter(post).length).toBe(0);
  });
});

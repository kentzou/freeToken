import { describe, expect, it } from "vitest";
import {
  API, UPSTREAM_REPO, closeIssue, commentIssue, createIssue, dispatchWorkflow, fetchRawText, gh, headStatus, latestCommitSha,
} from "../crawler/github.mjs";
import { mkFetch, noSleep, res } from "./helpers/fake-fetch";

describe("GitHub 单一调用层", () => {
  it("GET 500 重试后成功：三次退避 [1000,4000,10000] 用注入 sleep 记录", async () => {
    const slept: number[] = [];
    const { fn, calls } = mkFetch(res(500), res(500), res(200, []));
    const r = await gh(API + "/x", { fetchImpl: fn, sleep: (ms: number) => { slept.push(ms); return Promise.resolve(); } });
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(slept).toEqual([1000, 4000]);
    void noSleep;
  });

  it("GET 三次全 500：抛「重试 3 次」而不是假成功", async () => {
    const { fn, calls } = mkFetch(res(500));
    await expect(gh(API + "/x", { fetchImpl: fn, sleep: noSleep() })).rejects.toThrowError(/重试 3 次/);
    expect(calls).toHaveLength(4);
  });

  it("POST 422 不重试（幂等/权限问题重试无意义），原样交调用方判", async () => {
    const { fn, calls } = mkFetch(res(422, { message: "validation failed" }));
    const r = await gh(API + "/issues", { method: "POST", body: { title: "t" }, fetchImpl: fn });
    expect(calls).toHaveLength(1);
    expect(r.status).toBe(422);
  });

  it("latestCommitSha：GET 列表取 [0].sha；空数组抛可读错误", async () => {
    const a = mkFetch(res(200, [{ sha: "deadbeef" }]));
    expect(await latestCommitSha(UPSTREAM_REPO, { fetchImpl: a.fn })).toBe("deadbeef");
    expect(a.calls[0].url).toBe(`${API}/repos/hope0719/token-fbi/commits?per_page=1`);
    expect((a.calls[0].init.headers as Record<string, string>)["user-agent"]).toBe("token-intel-bureau-pipeline");
    const b = mkFetch(res(200, []));
    await expect(latestCommitSha(UPSTREAM_REPO, { fetchImpl: b.fn })).rejects.toThrowError(/上游 commit 列表形态异常/);
  });

  it("fetchRawText：非 2xx 抛错并带上 URL（解析失败必停的入口）", async () => {
    const { fn } = mkFetch(res(404));
    await expect(fetchRawText("https://raw.githubusercontent.com/x/y/main/app.js", { fetchImpl: fn })).rejects.toThrowError(
      /404.*app\.js/
    );
  });

  it("createIssue/commentIssue/closeIssue/dispatchWorkflow：payload 逐字段断言（写操作只此一门）", async () => {
    const { fn, calls } = mkFetch(res(201, { number: 7, html_url: "https://github.com/o/r/issues/7" }), res(201, {}), res(200, {}), res(202, {}));
    const opts = { token: "tok", fetchImpl: fn };
    const issue = await createIssue("o/r", { title: "审核：x", body: "正文", labels: ["review"] }, opts);
    expect(issue).toEqual({ number: 7, url: "https://github.com/o/r/issues/7" });
    expect(calls[0]).toMatchObject({ url: `${API}/repos/o/r/issues`, init: { method: "POST" } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ title: "审核：x", body: "正文", labels: ["review"] });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    await commentIssue("o/r", 7, "已合入", opts);
    expect(calls[1].url).toBe(`${API}/repos/o/r/issues/7/comments`);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ body: "已合入" });
    await closeIssue("o/r", 7, opts);
    expect(calls[2].init.method).toBe("PATCH");
    expect(JSON.parse(calls[2].init.body as string)).toEqual({ state: "closed" });
    await dispatchWorkflow("o/r", "crawl.yml", "main", opts);
    expect(calls[3].url).toBe(`${API}/repos/o/r/actions/workflows/crawl.yml/dispatches`);
    expect(JSON.parse(calls[3].init.body as string)).toEqual({ ref: "main" });
  });

  it("headStatus：网络炸了返回 0 而不是抛——HEAD 校验只 warn 不阻塞（spec §7.7）", async () => {
    const boom = mkFetch(new Error("connection reset"));
    expect(await headStatus("https://example.com/", { fetchImpl: boom.fn, sleep: noSleep() })).toBe(0);
    const ok404 = mkFetch(res(404));
    expect(await headStatus("https://example.com/", { fetchImpl: ok404.fn })).toBe(404);
  });
});

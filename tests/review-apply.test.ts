import { describe, expect, it } from "vitest";
import { parseCommands, runReview } from "../scripts/review-apply.mjs";

function res(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function mkFetch(...responses: unknown[]) {
  const calls: { url: string; init: Record<string, unknown> }[] = [];
  let i = 0;
  const fn = async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as Record<string, unknown> });
    return responses[Math.min(i++, responses.length - 1)];
  };
  return { fn, calls };
}

const pending = {
  version: 1, upstreamSha: "s", detectedAt: "t",
  changes: [
    { kind: "card", name: "甲", before: { name: "甲", link: "https://a1/" }, after: { name: "甲", link: "https://a2/" }, fields: [] },
    { kind: "card", name: "乙", before: { name: "乙", link: "https://b1/" }, after: { name: "乙", link: "https://s.mi.cn/bad" }, fields: [] },
  ],
};
const data = { cards: [{ name: "甲", link: "https://a1/" }, { name: "乙", link: "https://b1/" }], donots: [], rules: { featured: [], logo: [], cardCopy: [], detailSlug: [], regionByName: {} } };

describe("review-apply：Issue 评论 → 合入（workflow review job 的入口）", () => {
  it("parseCommands：多行 / 逗号 / 全角逗号混排 + all 展开", () => {
    const cmds = parseCommands("/approve card:甲\n/reject card:乙，card:丙");
    expect(cmds).toEqual([
      { action: "approve", id: "card:甲" },
      { action: "reject", id: "card:乙" },
      { action: "reject", id: "card:丙" },
    ]);
    expect(parseCommands("hello").length).toBe(0);
  });

  it("approve all：干净的甲合入、脏的乙同批被 validate 拦下 → 整体抛错不落盘（宁可不合，不半合）", async () => {
    await expect(
      runReview({ repo: "me/r", issueNumber: 5, pending, data, comment: "/approve all", token: "t", fetchImpl: async () => res(201, {}) })
    ).rejects.toThrowError(/推广短链域名|拒绝写盘/);
  });

  it("单条 approve：files 四件套、pending 剩一条、回帖 payload 断言、未清空不关 Issue", async () => {
    const { fn, calls } = mkFetch(res(201, {}));
    const r = await runReview({ repo: "me/r", issueNumber: 5, pending, data, comment: "/approve card:甲", token: "t", fetchImpl: fn });
    expect(r.changed).toBe(true);
    expect(r.files["data/tokens.json"]).toContain("https://a2/");
    expect(r.files["pending/changes.json"]).toContain("乙");
    const post = calls[0];
    expect(post.url).toBe("https://api.github.com/repos/me/r/issues/5/comments");
    expect(JSON.parse(post.init.body as string).body).toContain("✅ 通过");
    expect(calls.some((c) => String(c.init.method) === "PATCH")).toBe(false);
  });

  it("reject 最后一条 → pending 清空 → 自动关闭 Issue + changed 仍 true（空档案落盘）", async () => {
    const { fn, calls } = mkFetch(res(201, {}), res(200, {}));
    const r = await runReview({ repo: "me/r", issueNumber: 5, pending: { ...pending, changes: [pending.changes[0]] }, data, comment: "/reject card:甲", token: "t", fetchImpl: fn });
    expect(JSON.parse(r.files["pending/changes.json"])).toMatchObject({ version: 1, changes: [] });
    expect(calls.some((c) => c.init.method === "PATCH" && c.url.endsWith("/issues/5"))).toBe(true);
  });
});

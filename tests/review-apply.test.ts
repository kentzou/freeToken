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

  it("(C) 放宽依据：命令解析面宽于 workflow 的 startsWith —— 大小写/前导空白/夹带说明都认", () => {
    /* 这三条正是旧 job if 会挡掉、而 parseCommands 能吃的形态：触发条件必须退化成只按 label，
       否则「谁都能看懂的审批指令」会在 workflow 层静默失效。 */
    expect(parseCommands("/APPROVE card:甲")).toEqual([{ action: "approve", id: "card:甲" }]);
    expect(parseCommands("   /reject card:乙")).toEqual([{ action: "reject", id: "card:乙" }]);
    expect(parseCommands("核过了，官方地址我打开确认在。\n/approve all")).toEqual([{ action: "approve", id: "all" }]);
    /* 实测裁决：parseCommands 逐行只产 1 条 {approve, all}——`all` 的展开发生在 runReview 层
       （本文件「approve all」例已钉死）， brief 原写的 .toBe(2) 把两层的活记到了同一层账上。
       改断言为「等值整形」而非长度，顺带把「说明行不吃指令」也钉住。 */
    /* 反向：正文里没有指令 → 零命令，runReview 走 changed:false 空跑分支（不会误合任何一条） */
    expect(parseCommands("只是路过评论一句")).toEqual([]);
  });

  it("(C) 空跑兜底：无指令评论 changed=false、零 GitHub 调用、files 为空（放宽触发面的安全前提）", async () => {
    /* 放宽后审核 Issue 下每条评论都会起 review job，「不碰任何东西」必须有牙：
       用记录型 fetchImpl 断言调用数为 0（比注入抛错更硬——抛错只能证明「没走到」，
       记录数能证明早退发生在任何网络 I/O 之前）；files 为空对象，CLI 分支据此不落盘，
       crawl.yml 的提交步骤也就不会遇到 pending/ 缺失（评审 C1 的根因）。 */
    const { fn, calls } = mkFetch(res(201, {}));
    const r = await runReview({
      repo: "me/r", issueNumber: 5, pending, data,
      comment: "核过了，但这条没下指令。\n下一版再议", token: "t", fetchImpl: fn,
    });
    expect(r.changed).toBe(false);
    expect(r.files).toEqual({});
    expect(r.applied).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(calls).toEqual([]);
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

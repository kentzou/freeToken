import { describe, expect, it } from "vitest";
import { applyDecisions } from "../crawler/approve.mjs";

const base = {
  pending: {
    version: 1,
    upstreamSha: "s",
    detectedAt: "t",
    changes: [
      { kind: "card", name: "甲", before: { name: "甲", link: "https://a1/" }, after: { name: "甲", link: "https://a2/" }, fields: [] },
      { kind: "card", name: "乙", before: { name: "乙", link: "https://b/" }, after: null, fields: [] },
      { kind: "watch", name: "丙", before: { name: "丙", why: "旧" }, after: { name: "丙", why: "新", link: "https://c/" }, fields: [] },
      { kind: "rules", name: "regionByName", before: { 丁: "中国大陆" }, after: { 丁: "海外" }, fields: [] },
    ],
  },
  cards: [
    { name: "甲", link: "https://a1/" },
    { name: "乙", link: "https://b/" },
  ],
  donots: [{ name: "丙", why: "旧" }],
  rules: { featured: [], logo: [], cardCopy: [], detailSlug: [], regionByName: { 丁: "中国大陆" } },
};
const clone = () => JSON.parse(JSON.stringify(base));

describe("applyDecisions：盖章合入（spec §7.6）", () => {
  it("approve 修改 → 采用 after，pending 移除该条", () => {
    const r = applyDecisions(clone(), [{ action: "approve", id: "card:甲" }]);
    expect(r.data.cards.find((c: { name: string }) => c.name === "甲").link).toBe("https://a2/");
    expect(r.pending.changes.map((e: { name: string }) => e.name)).toEqual(["乙", "丙", "regionByName"]);
  });

  it("reject 修改 → 现值纹丝不动，条目同样完结", () => {
    const r = applyDecisions(clone(), [{ action: "reject", id: "card:甲" }]);
    expect(r.data.cards.find((c: { name: string }) => c.name === "甲").link).toBe("https://a1/");
    expect(r.pending.changes.some((e: { name: string }) => e.name === "甲")).toBe(false);
  });

  it("approve 删除类（after=null）→ 卡片真消失；approve 观望/规则条目各归其位", () => {
    const r = applyDecisions(clone(), [
      { action: "approve", id: "card:乙" },
      { action: "approve", id: "watch:丙" },
      { action: "approve", id: "rules:regionByName" },
    ]);
    expect(r.data.cards.map((c: { name: string }) => c.name)).toEqual(["甲"]);
    expect(r.data.donots[0].why).toBe("新");
    expect(r.data.rules.regionByName["丁"]).toBe("海外");
    expect(r.pending.changes).toHaveLength(1); // 只剩 card:甲 未处理
  });

  it("approve 脏 after（推广短链）→ validateCards 抛错，一切不落盘（审批台同一条红线）", () => {
    const b = clone();
    b.pending.changes[0].after = { name: "甲", link: "https://s.qiniu.com/XXXX" };
    expect(() => applyDecisions(b, [{ action: "approve", id: "card:甲" }])).toThrowError(/推广短链域名/);
  });

  it("未知 id 记入 missing 不误伤；全部处理完 pending 为空数组（/admin 空档案态依据）", () => {
    const r = applyDecisions(clone(), [
      { action: "approve", id: "card:不存在" },
      ...base.pending.changes.map((e) => ({ action: "reject" as const, id: `${e.kind}:${e.name}` })),
    ]);
    expect(r.missing).toEqual(["card:不存在"]);
    expect(r.pending.changes).toEqual([]);
  });

  it("approve 非法规则 after → validateRulesJson 抛错", () => {
    const b = clone();
    b.pending.changes[3].after = [{ source: "(", flags: "i", slug: "x" }];
    expect(() => applyDecisions(b, [{ action: "approve", id: "rules:regionByName" }])).toThrowError(/拒绝写盘/);
  });
});

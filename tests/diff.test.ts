import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diffAll, hasChanges, keyOf } from "../crawler/diff.mjs";
import { buildSeed } from "../scripts/export-seed.mjs";
import { linkRisk } from "../crawler/clean.mjs";
import { injectUpstreamItem } from "./helpers/upstream";

const FIXTURE = readFileSync("tests/fixtures/upstream-data.json", "utf8");
const CONFIG = JSON.parse(readFileSync("config/site-config.json", "utf8"));
/* Q1 基底 = 本地三件套：切换后管线吃的是「上游事实 × 本地观点」，只喂上游文本不再成立 */
const LOCAL = {
  cards: JSON.parse(readFileSync("data/tokens.json", "utf8")),
  donots: JSON.parse(readFileSync("data/donots.json", "utf8")),
  rules: JSON.parse(readFileSync("data/rules.json", "utf8")),
};
const SEED = buildSeed(FIXTURE, CONFIG, LOCAL);
const PREV = { cards: SEED.cards, donots: SEED.donots, rules: SEED.rules };

describe("三分类比对（spec §7.5）", () => {
  it("fixture 快照身份钉死：内容漂移必须显式改断言", () => {
    expect(createHash("sha256").update(FIXTURE).digest("hex").slice(0, 16)).toBe("0276a024c4f6e10e");
  });

  it("同输入零差异（基线：36→32 清洗后自比全空）", () => {
    const d = diffAll(PREV, PREV);
    expect([d.added.length, d.changed.length, d.removed.length]).toEqual([0, 0, 0]);
    expect(hasChanges(d)).toBe(false);
  });

  it("新增带 userCode= 的卡 → 走同一条管线自动清洗为干净链接（spec §11.1 必测）", () => {
    const injected = injectUpstreamItem(FIXTURE, {
      name: "集成测试新卡",
      category: "model",
      quota: "500 万 tokens",
      last_verified: "2026-09-29",
      entry_url: "https://example.com/a?userCode=ygtxup80",
    });
    const next = buildSeed(injected, CONFIG, LOCAL);
    const d = diffAll(PREV, { cards: next.cards, donots: next.donots, rules: next.rules });
    expect(d.added.map((e) => e.name)).toEqual(["集成测试新卡"]);
    expect(d.added[0].after.link).toBe("https://example.com/a");
    expect(linkRisk(d.added[0].after.link)).toBeNull();
  });

  it("修改：只动 quota → 一条 changed，fields 精确到字段", () => {
    const target = PREV.cards[3];
    const next = {
      ...PREV,
      cards: PREV.cards.map((c) => (c === target ? { ...c, quota: (c.quota || "") + "（改）" } : c)),
    };
    const d = diffAll(PREV, next);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].kind).toBe("card");
    expect(keyOf(d.changed[0])).toBe(`card:${target.name}`);
    expect(d.changed[0].fields.map((f: { field: string }) => f.field)).toEqual(["quota"]);
    expect(d.changed[0].after.quota).toContain("（改）");
  });

  it("删除：卡片消失 → removed 携带 before 快照（审批合入的依据）", () => {
    const gone = PREV.cards[5];
    const next = { ...PREV, cards: PREV.cards.filter((c) => c !== gone) };
    const d = diffAll(PREV, next);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0].name).toBe(gone.name);
    expect(d.removed[0].before).toEqual(gone);
    expect(d.removed[0].after).toBeNull();
  });

  it("观望名单同样参与三分类（kind=watch）", () => {
    const next = {
      ...PREV,
      donots: [...PREV.donots, { name: "测试观望项", why: "额度太小", link: "https://example.com/" }],
    };
    const d = diffAll(PREV, next);
    expect(d.added.map((e) => keyOf(e))).toEqual(["watch:测试观望项"]);
  });

  it("规则表任一变动 → changed 出现 rules 项（name=表名，before/after 为整表，spec §6 同步必审）", () => {
    const next = { ...PREV, rules: { ...PREV.rules, regionByName: { ...PREV.rules.regionByName, 新条目: "中国大陆" } } };
    const d = diffAll(PREV, next);
    expect(d.changed.map((e) => keyOf(e))).toEqual(["rules:regionByName"]);
    expect(d.changed[0].after["新条目"]).toBe("中国大陆");
  });

  it("五张规则表同时逐表比对：featured/logo/cardCopy/detailSlug/regionByName 各自独立成条", () => {
    const d = diffAll(PREV, { ...PREV, rules: { featured: [], logo: [], cardCopy: [], detailSlug: [], regionByName: {} } });
    expect(d.changed.map((e) => e.name).sort()).toEqual(
      ["cardCopy", "detailSlug", "featured", "logo", "regionByName"]
    );
  });
});

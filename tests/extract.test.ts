import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractStructures, stripMergeBlock } from "../crawler/extract.mjs";

const MIRROR = path.resolve(process.cwd(), "..", "token-fbi", "app.js");

describe("extract：真实镜像源码", () => {
  const src = readFileSync(MIRROR, "utf8");

  it("扣除合并块后不含 site-config 痕迹", () => {
    const base = stripMergeBlock(src);
    expect(base).not.toContain("SITE_CONFIG");
    expect(base.length).toBeLessThan(src.length);
  });

  it("提取到 41 张情报卡与 22 条观望名单", () => {
    const out = extractStructures(src);
    expect(out.TOKENS).toHaveLength(41);
    expect(out.DONOTS).toHaveLength(22);
  });

  it("卡片字段保真（以 WorkBuddy 为样本）", () => {
    const t = extractStructures(src).TOKENS.find((x) => x.name === "WorkBuddy");
    expect(t.rating).toBe(5);
    expect(t.updated).toBe("2026-09-11");
    expect(t.limited).toBe("2026-10-10");
    expect(t.link).toBe("https://curl.qcloud.com/8dvDMEyi"); // 未清洗的原值
  });

  it("规则表以 source + flags 出参，可 JSON 序列化", () => {
    const out = extractStructures(src);
    expect(out.FEATURED_RULES.map((r) => r.label)).toEqual([
      "DeepSeek V4",
      "GLM 5.2",
      "Kimi K3",
      "千问 3.8 Max",
      "Hy3",
      "LongCat 2.0",
    ]);
    expect(out.FEATURED_RULES[0].source).toBe("deepseekv(?:[4-9]|1\\d)");
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it("flags 逐条保真（实测：三张 pair 表 72/72 带 i，FEATURED 6/6 为空）", () => {
    /* 回归护栏：只存 source 会让 /i 规则还原成大小写敏感，logo 与 detailSlug 大面积失效 */
    const out = extractStructures(src);
    expect(out.LOGO_RULES.every((r) => r.flags === "i")).toBe(true);
    expect(out.CARD_COPY_RULES.every((r) => r.flags === "i")).toBe(true);
    expect(out.DETAIL_SLUG_RULES.every((r) => r.flags === "i")).toBe(true);
    expect(out.FEATURED_RULES.every((r) => r.flags === "")).toBe(true);
    expect(out.LOGO_RULES[0]).toEqual({
      source: expect.any(String),
      flags: "i",
      slug: expect.any(String),
    });
  });

  it("LOGO/CARD_COPY/DETAIL_SLUG/REGION 齐备", () => {
    const out = extractStructures(src);
    expect(out.LOGO_RULES.length).toBe(32);
    expect(out.CARD_COPY_RULES.length).toBe(19);
    expect(out.DETAIL_SLUG_RULES.length).toBe(21);
    expect(out.REGION_BY_NAME["OpenRouter"]).toBe("美国");
  });

  it("跨 realm：vm 求出的 RegExp 只能由 types.isRegExp 认出", () => {
    /* 实测：`item.re instanceof RegExp` 对 vm 里求值出的正则恒为 false，
       会把整套规则误判成「结构异常」。若实现被改回 instanceof，本用例直接抛错。 */
    const out = extractStructures(src);
    expect(out.FEATURED_RULES.every((r) => typeof r.source === "string" && r.source.length > 0)).toBe(true);
    expect(out.DETAIL_SLUG_RULES.every((r) => typeof r.slug === "string" && r.slug.length > 0)).toBe(true);
    expect(out.LOGO_RULES.every((r) => typeof r.slug === "string" && r.slug.length > 0)).toBe(true);
  });

  it("提取失败要抛错，不能返回空数组", () => {
    expect(() => extractStructures("const NOTHING = [];")).toThrow(/TOKENS/);
  });

  it("vm 求值不依赖 DOM（源码里的渲染函数不参与求值）", () => {
    expect(() => extractStructures(src)).not.toThrow();
  });
});

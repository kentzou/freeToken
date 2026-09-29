import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compiledRules } from "@/lib/rules";
import type { RulesJson } from "@/lib/types";

/* 非法正则样本：source="(" 无法编译；slug 保留供报错定位（终审遗留 #4） */
const broken: RulesJson = {
  featured: [{ label: "DeepSeek V4", source: "deepseek ?v4", flags: "i" }],
  logo: [{ source: "(", flags: "i", slug: "tencent.png" }],
  cardCopy: [],
  detailSlug: [],
  regionByName: {},
};

describe("compiledRules 报错可读性与结构守卫", () => {
  it("非法正则：错误必须带「表名#序号(键名)」，光有 source 无法定位", () => {
    expect(() => compiledRules(broken)).toThrowError(/logo#0\(tencent\.png\)/);
  });
  it("规则表缺失/非数组：抛可读错误而不是 TypeError 崩栈", () => {
    expect(() => compiledRules({ ...broken, logo: undefined as never })).toThrowError(
      /logo 缺失或不是数组/
    );
  });
  it("真实 data/rules.json：六 featured / 32 logo / 19 cardCopy / 21 detailSlug 全还原", () => {
    const rules = JSON.parse(readFileSync("data/rules.json", "utf8")) as RulesJson;
    const c = compiledRules(rules);
    expect(c.featured).toHaveLength(6);
    expect(c.logo).toHaveLength(32);
    expect(c.cardCopy).toHaveLength(19);
    expect(c.detailSlug).toHaveLength(21);
  });
});

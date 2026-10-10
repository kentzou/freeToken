import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FeaturedCard from "../src/components/FeaturedCard";
import { compiledRules } from "../src/lib/rules";
import type { RulesJson, TokenCard } from "../src/lib/types";

/** 精选卡角标的两条红线：
 *  ① 文案跟着这张卡自己的类目走——写死「编程工具精选」是旧版第二格恰为工具卡时的产物，
 *     精选对换成大模型卡（腾讯元器）后它就成假标签；
 *  ② 带角标的卡必须同时带上 has-editor-badge 修饰类——CSS 靠它给左下角那枚绝对定位角标
 *     预留底部空间，类一丢就回到「角标压住卡脚事实行」的旧现场（1280 宽截图实测过）。
 *  卡数据直接取 data/tokens.json 里的真实两张（WorkBuddy=工具 / 阶跃星辰 StepFun=大模型），不另造夹具。
 *  2026-10-10：原大模型样本「腾讯元器」经用户批准下架（上游已整卡删除的滞留卡），换成同为磁盘真卡的
 *  阶跃星辰 StepFun（大模型、alwaysShow、pin 5）——被测的是「角标文案跟着这张卡自己的类目走」，换样本不影响判据。 */
const rules = compiledRules(JSON.parse(readFileSync("data/rules.json", "utf8")) as RulesJson);
const cards = JSON.parse(readFileSync("data/tokens.json", "utf8")) as TokenCard[];
const render = (name: string, index: 0 | 1) => {
  const card = cards.find((c) => c.name === name);
  if (!card) throw new Error(`data/tokens.json 里没有「${name}」，这条钉子失去被测对象`);
  return renderToString(createElement(FeaturedCard, { card, index, rules }));
};

describe("精选卡角标（文案随类目、留白随角标）", () => {
  it("大模型卡 → 文案是「大模型精选」，不得沿用「编程工具精选」", () => {
    const html = render("阶跃星辰 StepFun", 1);
    expect(html).toContain("大模型精选");
    expect(html).not.toContain("编程工具精选");
  });

  it("工具卡 → 文案保持「编程工具精选」", () => {
    expect(render("WorkBuddy", 1)).toContain("编程工具精选");
  });

  it("只有第二格带角标，且带角标的卡同时带上负责留白的 has-editor-badge 类", () => {
    expect(render("WorkBuddy", 0)).not.toContain("editor-badge");
    const html = render("WorkBuddy", 1);
    expect(html).toContain("editor-badge");
    expect(html).toContain("has-editor-badge");
  });
});

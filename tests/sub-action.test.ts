import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntelCard from "../src/components/IntelCard";
import SubAction from "../src/components/SubAction";
import { compiledRules } from "../src/lib/rules";
import { readFileSync } from "node:fs";
import type { RulesJson, TokenCard } from "../src/lib/types";

/* SubAction 是「卡片的副按钮」与「详情页的副按钮」共用的一处实现（两处各写一遍必然漂移：
 * 一处补了 BASE 前缀、另一处忘了，子路径部署就断链）。这里钉它的对外契约四条。 */
const rules = compiledRules(JSON.parse(readFileSync("data/rules.json", "utf8")) as RulesJson);
const cards = JSON.parse(readFileSync("data/tokens.json", "utf8")) as TokenCard[];
const sub = (props: { link: string; text: string; className?: string }) =>
  renderToString(createElement(SubAction, props));

describe("SubAction：卡片与详情页共用的副动作落地", () => {
  it("站内相对链接经 pageHref 成形，且不新开窗口", () => {
    const html = sub({ link: "/openrouter/", text: "免费模型台账" });
    const tag = /<a class="card-action" href="\/openrouter\/"[^>]*>免费模型台账<\/a>/.exec(html);
    expect(tag, "站内链接没按「同页打开」形态渲染").not.toBeNull();
    expect(tag![0]).not.toContain("target=");
  });

  it("http(s) 外链原样透传，新开窗口并带 noopener", () => {
    const html = sub({ link: "https://example.com/promo", text: "特惠" });
    expect(html).toBe('<a class="card-action" href="https://example.com/promo" target="_blank" rel="noopener noreferrer">特惠</a>');
  });

  it("类名由调用方决定：详情页传 btn-ghost，卡片沿用默认 card-action", () => {
    expect(sub({ link: "/openrouter/", text: "台账", className: "btn-ghost" })).toContain('class="btn-ghost"');
    expect(sub({ link: "/openrouter/", text: "台账" })).toContain('class="card-action"');
  });

  it("与 IntelCard 同源：卡片渲染出的台账按钮逐字等于直接渲染 SubAction", () => {
    const card = cards.find((c) => c.name === "OpenRouter");
    expect(card?.extraAction, "OpenRouter 卡不再有 extraAction，这条钉子失去被测对象").toBeTruthy();
    const inCard = /<a class="card-action" href="[^"]*"[^>]*>免费模型台账<\/a>/.exec(
      renderToString(createElement(IntelCard, { card: card as TokenCard, rules }))
    );
    expect(inCard, "卡片里找不到台账按钮").not.toBeNull();
    expect(inCard![0]).toBe(sub({ link: card!.extraAction!.link, text: card!.extraAction!.text }));
  });
});

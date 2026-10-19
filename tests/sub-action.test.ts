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

  it("副按钮挂的是推广链时同样标 sponsored：与主按钮共用 linkRel 一份判据（牙齿：本卡自营短链挂在副按钮上）", () => {
    /* 2026-10-19 实测：七牛云 AI 新用户礼包上首页后，同一枚自有活动短链既是 link 又是 extraAction.link，
       主按钮带 sponsored 而副按钮漏标——公开口径写的是「这类链接一律标 sponsored」，两处形态必须一致。
       名单只有一份（crawler/clean.mjs 的 OWN_SHORT_LINKS），这里不另立判据。 */
    const card = cards.find((c) => c.name === "\u4e03\u725b\u4e91 AI \u65b0\u7528\u6237\u793c\u5305");
    expect(card?.extraAction, "七牛卡不再有 extraAction，这条钉子失去被测对象").toBeTruthy();
    expect(card?.link, "七牛卡主链不再是同一枚短链，被测前提失效").toBe(card!.extraAction!.link);
    const html = sub({ link: card!.extraAction!.link, text: card!.extraAction!.text });
    expect(html).toContain('rel="sponsored nofollow noopener noreferrer"');
    expect(html).not.toContain('rel="noopener noreferrer"');
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

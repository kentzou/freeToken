import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntelCard from "../src/components/IntelCard";
import { compiledRules } from "../src/lib/rules";
import type { RulesJson, TokenCard } from "../src/lib/types";

/* OpenRouter 改成普通卡后，「卡脚副按钮」是它与其余卡的共同能力（extraAction 此前只存在于数据里，
 * 没有任何组件消费它）。这里钉四条：
 * ① 站内相对链接（/openrouter/）必须经 pageHref——原样吐相对串在子路径部署（BASE_PATH）下会断链；
 * ② 外链（Qoder 的飞书特惠页）保持原样，且新开窗口带 noopener；
 * ③ 副按钮与主动作同处一个 .card-actions 组，CSS 的整组换行与 ≤639px 竖向堆叠都以这个容器为前提；
 * ④ 没有 extraAction 的卡不得凭空多出一枚按钮（.card-action 计数恒为 1）。
 * 卡数据取 data/tokens.json 的真实卡片，不另造夹具。 */
const rules = compiledRules(JSON.parse(readFileSync("data/rules.json", "utf8")) as RulesJson);
const cards = JSON.parse(readFileSync("data/tokens.json", "utf8")) as TokenCard[];
const render = (name: string) => {
  const card = cards.find((c) => c.name === name);
  if (!card) throw new Error(`data/tokens.json 里没有「${name}」，这条钉子失去被测对象`);
  return renderToString(createElement(IntelCard, { card, rules }));
};
/** 卡脚动作数：只认闭合引号紧跟的 class="card-action"，容器 class="card-actions" 不计入 */
const actionCount = (html: string) => html.split('class="card-action"').length - 1;

describe("情报卡副按钮（extraAction 落地）", () => {
  it("OpenRouter 的台账入口是站内链接：经 pageHref 成形，且整条锚点不带 target", () => {
    const html = render("OpenRouter");
    const tag = /<a class="card-action" href="\/openrouter\/"[^>]*>免费模型台账<\/a>/.exec(html);
    expect(tag, "台账副按钮没按「站内链接」形态渲染").not.toBeNull();
    expect(tag![0]).not.toContain("target=");
  });

  it("Qoder（灵码）的外链副按钮保持原样、新开窗口并带 noopener", () => {
    const html = render("阿里云 Qoder（灵码）");
    expect(
      /<a class="card-action" href="https:\/\/my\.feishu\.cn[^"]*" target="_blank" rel="[^"]*noopener[^"]*">49 元特惠<\/a>/.test(
        html
      )
    ).toBe(true);
  });

  it("副按钮与主动作同组，且副按钮排在主动作之前", () => {
    const html = render("OpenRouter");
    const group = /<span class="card-actions">([\s\S]*?)<\/span>/.exec(html);
    expect(group, "卡脚没有 .card-actions 操作组").not.toBeNull();
    expect(group![1]).toContain("免费模型台账");
    expect(group![1]).toContain("立即领取");
    expect(actionCount(html)).toBe(2);
  });

  it("无 extraAction 的卡只渲染一枚动作按钮", () => {
    const plain = cards.find((c) => !c.extraAction && !c.poster);
    expect(plain, "tokens.json 里没有可测的无副按钮卡").toBeTruthy();
    expect(actionCount(render(plain!.name))).toBe(1);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compiledRules } from "@/lib/rules";
import { visibleCards } from "@/lib/catalog";
import type { RulesJson, TokenCard, WatchItem } from "@/lib/types";

/* 精选门槛的放行面必须钉死：data/rules.json 的 featured 是「哪些卡上线」的唯一开关，
 * 改一条正则就会让若干卡同时上/下。这里用生产代码 visibleCards 判定，不手算。
 * 判据两条：新点名的卡必须在场；没点名的卡必须仍在门外（防正则误伤）。
 * OpenRouter 于 2026-10-05 由「首页专用入口长条」改判为普通情报卡，随之放行门槛——
 * 它现在是门槛表的一员，与其他卡同走 IntelCard 渲染，不再享受版面特例。 */
const j = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const load = () => {
  const rules = compiledRules(j("data/rules.json") as RulesJson);
  const cards = j("data/tokens.json") as TokenCard[];
  const donots = j("data/donots.json") as WatchItem[];
  return { cards, donots, names: visibleCards(cards, donots, rules).map((c) => c.name) };
};

describe("精选门槛放行面（featured 规则改动会被这里拦住）", () => {
  it("新点名的卡已放行：腾讯元器 / 百度千帆（文心）/ 讯飞星火（开放平台）/ OpenRouter", () => {
    const { names } = load();
    for (const n of ["腾讯元器", "百度千帆（文心）", "讯飞星火（开放平台）", "OpenRouter"]) {
      expect(names, n).toContain(n);
    }
  });

  it("新规则零误伤：这 8 张未点名卡仍被挡在门外", () => {
    const { names } = load();
    for (const n of [
      "Agnes AI",
      "MonkeyCode（长亭）",
      "TeleAgent（星辰超级智能体）",
      "小米 MiMo（Xiaomi）",
      "字节 TRAE（AI IDE）",
      "阿里云百炼（DashScope）",
      "MiniMax Code 国庆签到",
      "Google Antigravity（反重力）",
    ]) {
      expect(names, n).not.toContain(n);
    }
  });

  it("「星辰」不得进 featured：会误伤阶跃星辰 StepFun / TeleAgent 两个品牌", () => {
    // 讯飞星火的正规写法是「星火」；一旦有人图省事写「星辰」，TeleAgent 会被连带放行。
    const rules = j("data/rules.json") as RulesJson;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
    for (const r of rules.featured) {
      expect(norm(r.source), `featured「${r.label}」含「星辰」`).not.toContain("星辰");
    }
  });

  it("观望剔除与精选门槛互不干扰：donots 里的卡一张都不许出现", () => {
    const { donots, names } = load();
    for (const d of donots) expect(names, d.name).not.toContain(d.name);
  });
});

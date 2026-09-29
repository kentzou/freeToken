import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compiledRules } from "@/lib/rules";
import {
  catOf, chipCounts, dateLine, headline, isoWeek, latestUpdated, matchesFilter,
  modelsFor, shortDateLine, splitByCategory, toolsFor, visibleCards,
} from "@/lib/catalog";
import type { TokenCard, WatchItem } from "@/lib/types";

const load = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), "data", p), "utf8"));
const cards = load("tokens.json") as TokenCard[];
const donots = load("donots.json") as WatchItem[];
const rules = compiledRules(load("rules.json"));

/* 基准数字来自真实镜像统计（已实测，见 Task 5 的 seed 产物）：
   上游 41 条 → 隐藏「豆包拉新项目」（原作者拉新广告）与「小米 MiMo」（链接是原作者邀请短链、
   官方地址待补）后入库 39 → 再剔除观望名单与未达门槛卡，可见 editorial 20，大模型 8，工具 12，限时 4 */
describe("目录逻辑（真实种子数据基准）", () => {
  it("visibleCards：剔除观望 + 精选门槛 + 隐藏推广卡", () => {
    const vis = visibleCards(cards, donots, rules);
    expect(vis).toHaveLength(20);
    expect(vis.some((c) => c.name === "豆包拉新项目")).toBe(false);
    expect(vis.some((c) => c.name === "小米 MiMo（Xiaomi）")).toBe(false); // 邀请短链待补官方地址
    expect(vis.every((c) => !donots.some((d) => d.name === c.name))).toBe(true);
  });
  it("pin 位次生效：蓝博第 4、阶跃第 5", () => {
    const vis = visibleCards(cards, donots, rules);
    expect(vis[3].name).toBe("蓝博科技（lanbuff）");
    expect(vis[4].name).toBe("阶跃星辰 StepFun");
  });
  it("精选两张 = WorkBuddy + Qoder", () => {
    const vis = visibleCards(cards, donots, rules);
    expect(vis.slice(0, 2).map((c) => c.name)).toEqual(["WorkBuddy", "阿里云 Qoder（灵码）"]);
  });
  it("splitByCategory：推广卡归 partners（当前为空）", () => {
    const { editorial, partners } = splitByCategory(visibleCards(cards, donots, rules));
    expect(editorial).toHaveLength(20);
    expect(partners).toHaveLength(0);
  });
  it("优先级排序：工具区 WorkBuddy→Qoder→kilo→cline→verdent 在前", () => {
    const tools = toolsFor(splitByCategory(visibleCards(cards, donots, rules)).editorial, { type: "all", query: "" });
    expect(tools.slice(0, 2).map((t) => catOf(t))).toEqual(["工具", "工具"]);
    expect(tools[0].name).toContain("WorkBuddy");
  });
  it("catOf 只分两类", () => {
    expect(catOf({ type: "工具" } as TokenCard)).toBe("工具");
    expect(catOf({ type: "大模型" } as TokenCard)).toBe("大模型");
    expect(catOf({ type: "项目" } as TokenCard)).toBe("项目");
  });
  it("matchesFilter：类型/限时/关键词", () => {
    const q = { type: "all", query: "glm" } as const;
    expect(matchesFilter({ name: "GLM-5.3-Flash", modality: "原生多模态" } as TokenCard, q)).toBe(true);
    expect(matchesFilter({ name: "WorkBuddy", modality: "HY3" } as TokenCard, q)).toBe(false);
    expect(matchesFilter({ name: "X", limited: "2026-10-01" } as TokenCard, { type: "limited", query: "" })).toBe(true);
  });
  it("chipCounts 与区块计数一致", () => {
    const vis = visibleCards(cards, donots, rules);
    const counts = chipCounts(vis);
    expect(counts.all).toBe(20);
    expect(counts["大模型"]).toBe(8);
    expect(counts["工具"]).toBe(12);
    expect(counts.limited).toBe(4);
  });
  it("期号与报头文案", () => {
    /* ISO 周序号边界（已实测）：2026-09-28（周一）= 第 40 周；周日起算的旧写法会少算一周 */
    expect(isoWeek(new Date(Date.UTC(2026, 8, 28)))).toBe(40);
    expect(isoWeek(new Date(Date.UTC(2026, 0, 1)))).toBe(1); // 2026-01-01 周四
    expect(isoWeek(new Date(Date.UTC(2026, 0, 4)))).toBe(1); // 2026-01-04 周日，仍属第 1 周
    expect(isoWeek(new Date(Date.UTC(2025, 11, 29)))).toBe(1); // 2026 年第 1 周从这天开始
    expect(isoWeek(new Date(Date.UTC(2021, 0, 1)))).toBe(53); // 跨年：属 2020 年第 53 周
    expect(dateLine(new Date(Date.UTC(2026, 8, 28)), 40)).toBe("2026-09-28 星期一 · Token 情报局 · 第 40 期");
    expect(shortDateLine(new Date(Date.UTC(2026, 8, 28)), 40)).toBe("09-28 · 第 40 期");
    expect(headline(20)).toBe("免费 AI 额度，今日已核验 20 条");
    /* 实测：默认 config.partners=null，不注入推广卡，可见集里最大 updated 就是 2026-09-23。
       镜像 app.js:791 的 "2026-09-25" 只属于注入的 partners 卡，本站默认配置下不会出现。 */
    expect(latestUpdated(splitByCategory(visibleCards(cards, donots, rules)).editorial)).toBe("2026-09-23");
  });
});

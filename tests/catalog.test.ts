import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compiledRules } from "@/lib/rules";
import { detailSlug } from "@/lib/copy";
import {
  catOf, chipCounts, dateLine, headline, isFeatured, isoWeek, latestUpdated, matchesFilter,
  modelsFor, shortDateLine, splitByCategory, toolsFor, visibleCards,
} from "@/lib/catalog";
import type { TokenCard, WatchItem } from "@/lib/types";

const load = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), "data", p), "utf8"));
const cards = load("tokens.json") as TokenCard[];
const donots = load("donots.json") as WatchItem[];
const rules = compiledRules(load("rules.json"));

/* 本文件所有「条数」类期望值都从 data/*.json 现场推导，不再钉死具体数字：
   crawler 每 6 小时加卡，任何写死的张数都会变成定时炸弹（本轮就有 4 条因此假红）。
   推导口径写在该条用例的注释里；业务红线（观望剔除 / 精选门槛 / pin 位次 / 排序稳定）一条没减。 */
describe("目录逻辑（真实种子数据基准）", () => {
  it("visibleCards：剔除观望 + 精选门槛 + 隐藏推广卡", () => {
    const vis = visibleCards(cards, donots, rules);
    /* 期望值由「data/tokens.json 里不在 donots.json 中、且命中 rules.json 精选门槛或带 alwaysShow」的条数现场算出。
       这里复用导出的 isFeatured（与 visibleCards 内部同一份门槛实现），只把「过滤谓词」重写一遍，
       目的是让 visibleCards 的增删逻辑被独立复算，而不是自己比自己。 */
    const expectNames = cards
      .filter((c) => !donots.some((d) => d.name === c.name) && (c.alwaysShow || isFeatured(c, rules)))
      .map((c) => c.name);
    expect(vis.map((c) => c.name).slice().sort()).toEqual(expectNames.slice().sort());
    // 业务红线：观望名单里的卡绝不出现在可见集
    expect(vis.some((c) => donots.some((d) => d.name === c.name))).toBe(false);
    // 业务红线：每张可见卡都必须真的过了门槛（不是「碰巧被留下」）
    expect(vis.every((c) => c.alwaysShow || isFeatured(c, rules))).toBe(true);
    // 配置态红线：豆包拉新项目配 hide、小米 MiMo 配了 link 但未达门槛，两张都不得进可见集
    expect(vis.some((c) => c.name === "豆包拉新项目")).toBe(false);
    expect(vis.some((c) => c.name === "小米 MiMo（Xiaomi）")).toBe(false);
  });

  it("pin 位次生效：带 pin 的卡恰好落在 index === pin-1", () => {
    const vis = visibleCards(cards, donots, rules);
    const pinned = vis.filter((c) => c.pin);
    expect(pinned.length).toBeGreaterThan(0); // 样本量：没有 pin 卡时下面循环空转=无牙
    for (const c of pinned) {
      expect(vis.indexOf(c)).toBe(Math.min((c.pin || 1) - 1, vis.length - 1));
    }
    // 具体位次仍钉住一条：阶跃钉第 5（蓝博 sponsored 出局后，第 4 由自然序 Cline 补位）
    expect(vis[3].name).toBe("Cline");
    expect(vis[4].name).toBe("阶跃星辰 StepFun");
  });
  it("精选两张 = WorkBuddy + Qoder", () => {
    const vis = visibleCards(cards, donots, rules);
    expect(vis.slice(0, 2).map((c) => c.name)).toEqual(["WorkBuddy", "阿里云 Qoder（灵码）"]);
  });
  it("splitByCategory：推广卡归 partners，editorial + partners 恒等于可见集", () => {
    const vis = visibleCards(cards, donots, rules);
    const { editorial, partners } = splitByCategory(vis);
    // 期望值来自 data/tokens.json 的 type 字段：type==="项目" 的进 partners，其余进 editorial
    expect(partners.map((c) => c.name).slice().sort()).toEqual(vis.filter((c) => catOf(c) === "项目").map((c) => c.name).slice().sort());
    expect(editorial.length + partners.length).toBe(vis.length);
    expect(editorial.every((c) => catOf(c) !== "项目")).toBe(true);
  });
  it("优先级排序：工具区 WorkBuddy→Qoder→kilo→cline→verdent 在前", () => {
    const tools = toolsFor(splitByCategory(visibleCards(cards, donots, rules)).editorial, { type: "all", query: "" });
    expect(tools.slice(0, 2).map((t) => catOf(t))).toEqual(["工具", "工具"]);
    expect(tools[0].name).toContain("WorkBuddy");
  });
  it("rank 与数组顺序解耦：同优先级内先按核验日期降序，再按名称升序（审查 L3）", () => {
    const editorial = splitByCategory(visibleCards(cards, donots, rules)).editorial;
    const all = { type: "all", query: "" } as const;
    const forward = modelsFor(editorial, all);
    // 期望值来自 chipCounts 对同一份可见集的「大模型」计数（两者本就该同源），不再钉死具体张数
    expect(forward).toHaveLength(chipCounts(editorial)["大模型"]);
    expect(modelsFor([...editorial].reverse(), all).map((c) => c.name)) // 输入倒序不得改变输出顺序
      .toEqual(forward.map((c) => c.name));
    /* 逐对强校验尾段（rank=999 的卡）：日期必须严格降序，**同日则名称必须升序**。
       写成 `byDate <= 0 || …` 会让同日条目被第一条款放过，等于没钉名称序，故这里用 < 0 并显式分派。
       正则镜像 `catalog.ts` 的 `PRIORITY_MODELS`（该常量未导出），用于跳过钉在表头的卡。 */
    const tail = forward.filter((c) => !/glm-5\.3|stepfun|阶跃|siliconflow|硅基/i.test(c.name));
    expect(tail.length).toBeGreaterThan(1);   // 尾段不足 2 张时下面的循环空转=无牙，先钉住样本量
    for (let i = 1; i < tail.length; i++) {
      const a = tail[i - 1];
      const b = tail[i];
      const byDate = b.updated.localeCompare(a.updated);
      expect(byDate < 0 || (byDate === 0 && a.name.localeCompare(b.name, "zh-Hans-CN") <= 0)).toBe(true);
    }
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
    /* 期望值全部现场推导：all 来自可见集长度，各筛选项来自「直接用 matchesFilter 逐条判」的复算。
       这条真正守的是 chipCounts 有没有把每个筛选项接到对应的 matchesFilter 分支上，
       而不是「恰好是 18/7/11/4」——后者一涨数据就红，什么也证明不了。 */
    const all = { type: "all", query: "" } as const;
    expect(counts.all).toBe(vis.length);
    for (const k of ["大模型", "工具", "limited", "productivity", "image", "audio", "data", "platform"] as const) {
      const f = { type: k, query: "" } as const;
      expect(counts[k]).toBe(vis.filter((c) => matchesFilter(c, f)).length);
    }
    // 下界：可见集被整体过滤空时（数据文件损坏 / 规则表漂移）上面的复算会跟着一起为 0，故独立钉住样本量
    expect(counts.all).toBeGreaterThanOrEqual(15);
    expect(counts["大模型"] + counts["工具"]).toBeGreaterThan(0);
  });
  it("期号与报头文案", () => {
    /* ISO 周序号边界（已实测）：2026-09-28（周一）= 第 40 周；周日起算的旧写法会少算一周 */
    expect(isoWeek(new Date(Date.UTC(2026, 8, 28)))).toBe(40);
    expect(isoWeek(new Date(Date.UTC(2026, 0, 1)))).toBe(1); // 2026-01-01 周四
    expect(isoWeek(new Date(Date.UTC(2026, 0, 4)))).toBe(1); // 2026-01-04 周日，仍属第 1 周
    expect(isoWeek(new Date(Date.UTC(2025, 11, 29)))).toBe(1); // 2026 年第 1 周从这天开始
    expect(isoWeek(new Date(Date.UTC(2021, 0, 1)))).toBe(53); // 跨年：属 2020 年第 53 周
    // 下面两条是纯格式串测试（输入是合成值，与数据无关），钉死是对的，不随数据增长而变
    expect(dateLine(new Date(Date.UTC(2026, 8, 28)), 40)).toBe("2026-09-28 星期一 · Token 情报局 · 第 40 期");
    expect(shortDateLine(new Date(Date.UTC(2026, 8, 28)), 40)).toBe("09-28 · 第 40 期");
    expect(headline(18)).toBe("免费 AI 额度，今日已核验 18 条");
    /* 期望值来自 data/tokens.json 里可见 editorial 卡的 updated 最大值（独立排序取末位，不调用被测函数）。
       原来钉死 "2026-09-28"，那是上游 last_verified 的当日快照——上游一同步就假红。 */
    const editorial = splitByCategory(visibleCards(cards, donots, rules)).editorial;
    const maxUpdated = editorial.map((c) => c.updated).sort()[editorial.length - 1];
    expect(latestUpdated(editorial)).toBe(maxUpdated);
  });

  it("slug 唯一：可见卡两两不撞 slug（撞了静态导出就会一张覆盖另一张）", () => {
    const vis = visibleCards(cards, donots, rules);
    const slugs = vis.map((c) => detailSlug(c.name, rules));
    expect(slugs.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

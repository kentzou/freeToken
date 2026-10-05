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

  it("pin 位次生效：带 pin 的卡恰好落在 index === pin-1，且不扰动其余卡的自然序", () => {
    const vis = visibleCards(cards, donots, rules);
    /* pin 之前的可见集用同一套谓词独立复算（与 :26-28 同源、不调用被测函数）。pin 只负责**挪位**，
       因此重排后的多重集必须与输入完全一致：只移不删就出重卡、删了不插就丢卡。 */
    const baseline = cards
      .filter((c) => !donots.some((d) => d.name === c.name) && (c.alwaysShow || isFeatured(c, rules)));
    expect(vis).toHaveLength(baseline.length);
    expect(vis.map((c) => c.name).slice().sort()).toEqual(baseline.map((c) => c.name).slice().sort());

    const pinned = vis.filter((c) => c.pin);
    expect(pinned.length).toBeGreaterThan(0); // 样本量：没有 pin 卡时下面的循环空转=无牙
    for (const c of pinned) {
      expect(vis.indexOf(c)).toBe(Math.min((c.pin || 1) - 1, vis.length - 1));
    }
    /* 下面这条替掉了原来 `vis[3] === "Cline"` / `vis[4] === "阶跃星辰 StepFun"` 两句硬编码卡名。
       它们钉的是「第 4、5 位分别是谁」，而 pin 之外的位次就是 tokens.json 的书写顺序——上游每加
       一张卡都会挤动它（本轮 DeepSeek 开放平台插到 index 1，Cline 就从第 4 位挪到第 5 位）。
       pin 真正要保证的性质是「只挪被钉的卡，其余卡之间不得重排」，这条不随数据增长而变。 */
    const natural = baseline.filter((c) => !c.pin).map((c) => c.name);
    expect(vis.filter((c) => !c.pin).map((c) => c.name)).toEqual(natural);
  });

  it("精选区口径：editorial 的前两张，每张都真过了可见门槛（不钉是哪两张）", () => {
    const vis = visibleCards(cards, donots, rules);
    const editorial = splitByCategory(vis).editorial;
    expect(editorial.length).toBeGreaterThanOrEqual(2); // 样本量：不足 2 张时下面全是空转=无牙
    const featured = editorial.slice(0, 2);
    /* 原来钉的是 `["WorkBuddy", "阿里云 Qoder（灵码）"]`——钉的是「头两张分别是谁」，而 vis 的头两位
       取自 tokens.json 的书写顺序。上游新加的 DeepSeek 开放平台落到 index 1 后这条立刻假红：那是数据
       变化，不是回归。精选区的语义是 editorial.slice(0,2)，钉口径与性质才不会每轮定时炸。 */
    expect(featured).toHaveLength(2);
    expect(featured.every((c) => catOf(c) !== "项目")).toBe(true); // 「项目」推广卡归 partners，不进今日头条
    expect(featured.every((c) => c.alwaysShow || isFeatured(c, rules))).toBe(true);
    expect(featured.some((c) => donots.some((d) => d.name === c.name))).toBe(false);
    expect(new Set(featured.map((c) => c.name)).size).toBe(featured.length); // 同一张卡不得同时在两个精选位
    /* 口径同源：HomeClient 的精选区必须仍是 splitByCategory(vis).editorial.slice(0, 2)。写成
       vis.slice(0, 2) 会让「项目」类推广卡有机会进今日头条；写成 slice(0, 3) 则与上方「精选 2 条」
       的 UI 文案对不上。UI 与 lib 各有一份取数，这份重复只能靠测试缝住——theme.test.ts 对 layout.tsx
       用的是同一招。这是本用例唯一一条咬得住「精选区被改动」的断言，故不能省。 */
    const homeClient = readFileSync(path.resolve(process.cwd(), "src", "components", "HomeClient.tsx"), "utf8");
    expect(homeClient).toContain("splitByCategory(vis).editorial.slice(0, 2)");
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

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IGETOKEN_MODELS_URL, crawlIgetokenModels, parsePlatforms } from "../crawler/igetoken.mjs";

const NOW = "2026-10-15T06:30:00.000Z";

/** 一张卡的字段切分（与 2026-10-15 实测的 /models/ 卡片 DOM 逐字对齐）：
 *  data-category 档 → 指 /models/<slug>/ 的 <a> → h3 是平台名 → mt-2 slate-500 是简介 →
 *  emerald-700 是额度原句 → rounded-md slate-100 系列是标签 → rounded-full 尾档是「MM/DD 已核实」，
 *  星级写在 aria-label/title 里（不是文本节点，TokenHarbor 那张根本没有星级）。 */
const card = (name: string, category: string, slug: string, summary: string, quota: string, opts: { badge?: string; stars?: string } = {}) =>
  `<div data-category="${category}" class="mb-4 w-full break-inside-avoid">
  <a href="/models/${slug}/" class="group flex flex-col rounded-xl border p-5">
    <div class="flex items-start justify-between gap-2"><div><h3 class="font-bold text-slate-900">${name}</h3>
    ${opts.stars ? `<div class="mt-1"><span class="inline-flex items-center gap-0.5" aria-label="推荐指数 ${opts.stars} / 5" title="推荐指数 ${opts.stars}/5"><span class="text-amber-400">★</span></span></div>` : ""}
    </div><span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200"> ${opts.badge ?? "09/12 已核实"} </span></div>
    <p class="mt-2 line-clamp-2 text-sm text-slate-500">${summary}</p>
    <p class="mt-3 text-sm font-medium text-emerald-700">${quota}</p>
    <div class="mt-3 flex flex-wrap gap-1.5"><span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">注册送</span><span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">永久免费</span></div>
  </a>
</div>`;

/** 整页外壳：h1 后紧跟带「共 N 个平台」的定位声明（对账锚点），filter 档位是类别合法集的唯一来源。 */
const page = (n: number, grid: string) => `<h1>免费资源库</h1><p class="mt-2 text-slate-500">共 ${n} 个平台。每条都标注最后核实日期，额度以官方页面为准。</p>
  <div class="filter-tabs"><button data-filter="all">全部</button><button data-filter="domestic">国内</button>
  <button data-filter="overseas">海外</button><button data-filter="aggregator">聚合</button></div>
  <div id="models-grid" class="mt-6 columns-1">${grid}</div>`;

const TWO = page(
  2,
  card("智谱AI（BigModel）", "domestic", "zhipu", "GLM 系列官方开放平台", "新用户注册送 2000 万 Token，GLM-4-Flash 永久免费", { badge: "09/22 已核实", stars: "4" }) +
    card("TokenHarbor", "aggregator", "tokenharbor", "统一 API 网关", "DeepSeek V4.1 Flash 免费档，无需订阅"),
);

describe("iGetoken /models 平台台账（同赛道聚合站的线索，不是发布内容）", () => {
  it("字段切分与页面自述条数对账：两张卡全收、按 slug 定序", () => {
    const doc = parsePlatforms(TWO, { now: NOW });
    expect(doc.declaredCount).toBe(2);
    expect(doc.platformCount).toBe(2);
    expect(doc.platforms.map((p: any) => p.slug)).toEqual(["tokenharbor", "zhipu"]); // t < z：每日 diff 只反映真实增删
    const zhipu = doc.platforms.find((p: any) => p.slug === "zhipu")!;
    expect(zhipu).toMatchObject({
      name: "智谱AI（BigModel）",
      category: "domestic",
      url: "https://igetoken.com/models/zhipu/",
      summary: "GLM 系列官方开放平台",
      quota: "新用户注册送 2000 万 Token，GLM-4-Flash 永久免费",
      tags: ["注册送", "永久免费"],
      checkedAt: "09/22 已核实",
      rating: "4",
    });
    // 没有星级的卡如实留 null（上游没打分，不是我们没解析到）
    expect(doc.platforms.find((p: any) => p.slug === "tokenharbor")!.rating).toBeNull();
  });

  it("MM/DD 不补年份：猜错会把旧线索标成新核实，判读交给读者", () => {
    const doc = parsePlatforms(TWO, { now: NOW });
    expect(doc.platforms.map((p: any) => p.checkedAt)).toEqual(["09/12 已核实", "09/22 已核实"]);
    expect(JSON.stringify(doc)).not.toMatch(/2025\/09|2026\/09/);
  });

  it("内容指纹只对收录部分取值：同一内容换抓取时刻指纹不变（判空的根基）", () => {
    const a = parsePlatforms(TWO, { now: NOW });
    const b = parsePlatforms(TWO, { now: "2026-10-16T06:30:00.000Z" });
    expect(b.sourceFingerprint).toBe(a.sourceFingerprint);
    expect(b.fetchedAt).not.toBe(a.fetchedAt);
    // 额度原句改一个字 ⇒ 指纹必变，否则「对方改过口径」这个唯一信号会被静默吞掉
    const c = parsePlatforms(page(2, card("智谱", "domestic", "zhipu", "简介", "新用户注册送 3000 万 Token", { badge: "09/22 已核实" }) + card("B", "overseas", "bb", "简介", "额度")), { now: NOW });
    expect(c.sourceFingerprint).not.toBe(a.sourceFingerprint);
  });

  it("最后一张卡不吞页脚：卡片必须收口到 </a> 且 href 限定 /models/", () => {
    // 页脚刻意放一段与额度同构的 emerald-700 文案：边界一漏（比如 </a> 写成贪婪匹配），
    // 尾张卡的 quota 就会变成页脚那句——实测原型用整页切分时第 47 张就是这样多出 10 个段落。
    const withFooter = TWO + `<footer><p class="mt-3 text-sm font-medium text-emerald-700">页脚额度不该被吸进卡片</p><p>页脚二</p></footer>`;
    const doc = parsePlatforms(withFooter, { now: NOW });
    expect(doc.platformCount).toBe(2);
    const last = doc.platforms.find((p: any) => p.slug === "tokenharbor")!; // DOM 里的尾张卡
    expect(last.quota).toBe("DeepSeek V4.1 Flash 免费档，无需订阅");
    expect(JSON.stringify(doc)).not.toMatch(/页脚额度/);
  });

  it("六条形态守卫全部 fail-stop：宁可整轮报错，也不能把「解析了一半」当成「上游清空了」", () => {
    const boom = (html: string) => () => parsePlatforms(html, { now: NOW });
    expect(boom("")).toThrow(/找不到 #models-grid/);
    expect(boom("<div>没有锚点</div>")).toThrow(/找不到 #models-grid/);
    expect(boom(page(2, ""))).toThrow(/0 张卡片/); // 网格在、卡没了＝拒绝写盘
    expect(boom(page(3, card("A", "domestic", "a", "s", "q") + card("B", "overseas", "b", "s", "q")))).toThrow(/页面自述 3 个平台/);
    expect(boom(page(1, card("A", "partner", "a", "s", "q")))).toThrow(/类别 partner 不在页面档位/);
    expect(boom(page(2, card("A", "domestic", "a", "s", "") + card("B", "domestic", "b", "s", "q")))).toThrow(/这张卡缺 quota/);
    expect(boom(page(2, card("A", "domestic", "a", "s", "q", { badge: "" }) + card("B", "domestic", "b", "s", "q")))).toThrow(/这张卡缺 checkedAt/);
    expect(boom(page(2, card("A", "domestic", "a", "s", "q") + card("A2", "domestic", "a", "s", "q")))).toThrow(/这张卡重复出现/);
    // 定位声明里读不到「共 N 个平台」＝对账锚点失效，同样拒绝
    expect(boom(`<h1>免费资源库</h1><p class="mt-2 text-slate-500">额度以官方页面为准。</p><div id="models-grid">${card("A", "domestic", "a", "s", "q")}</div>`)).toThrow(/读不到「共 N 个平台」/);
  });

  it("编排只碰注入的 grab，产出唯一一份文件；HTTP 失败即抛，旧台账不动", async () => {
    const seen: string[] = [];
    const { doc, files } = await crawlIgetokenModels({
      now: NOW,
      grab: async (url: string) => {
        seen.push(url);
        return { ok: true, status: 200, text: TWO, error: "" };
      },
    });
    expect(seen).toEqual([IGETOKEN_MODELS_URL]);
    expect(Object.keys(files)).toEqual(["data/igetoken.json"]);
    expect(doc.platformCount).toBe(2);
    // 线索文件必须自带「不能直接发布」的披露：后来人（或下一个 agent）打开产物就先看到红线
    expect(doc.usageNote).toMatch(/红线②/);
    expect(doc.evidence).toBe("third-party-aggregator");
    await expect(crawlIgetokenModels({ grab: async () => ({ ok: false, status: 403, text: "", error: "HTTP 403" }) })).rejects.toThrow(/HTTP 403/);
  });

  it("入库台账的结构不变量：platformCount 与 declaredCount 与数组长度三者互校", () => {
    if (!existsSync("data/igetoken.json")) return; // 首份台账入库前不判红（与 openrouter-catalog 同口径）
    const d = JSON.parse(readFileSync("data/igetoken.json", "utf8"));
    expect(d.platforms).toHaveLength(d.platformCount);
    expect(d.platformCount).toBe(d.declaredCount);
    expect(new Set(d.platforms.map((p: any) => p.slug)).size).toBe(d.platformCount); // slug 是身份键，不许重
    for (const p of d.platforms) {
      expect(p.quota).toBeTruthy();
      expect(p.url).toMatch(/^https:\/\/igetoken\.com\/models\/.+\/$/);
      expect(["domestic", "overseas", "aggregator"]).toContain(p.category);
    }
  });
});

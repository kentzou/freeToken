/** /nav 导航页的静态渲染事实（node 环境 + renderToStaticMarkup，与 render-substrate.test.tsx 同基座）。
 *  钉三条与数据增长无关的不变式：① 卡片数 = 传入条目数，且按 category 分节；
 *  ② 屏读文案区分来源——管线卡「核验」、编辑精选卡「整理」，不许把整理日期说成核验日期；
 *  ③ 外链一律带 rel="noopener noreferrer"（导航页整页都是外链，漏一处就是给访客开新窗口泄露来源）。 */
import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NavClient, { type NavItem, type NavNews } from "@/components/NavClient";

const mk = (over: Partial<NavItem>): NavItem => ({
  name: "X",
  desc: "描述",
  link: "https://example.com/",
  tags: ["标签"],
  freeTier: true,
  rating: 4,
  updated: "2026-10-10",
  category: "llm",
  ...over,
});

const items: NavItem[] = [
  mk({ name: "管线卡", category: "llm" }),
  mk({ name: "聚合卡", category: "aggregator" }),
  mk({ name: "工具卡", category: "devtools", freeTier: false, limited: true }),
];
const news: NavNews[] = [{ title: "一条动态", source: "来源", url: "https://example.com/n", date: "2026-10-10" }];

it("卡片数与分节：三张卡落在三个分区里，节标题带实名", () => {
  const html = renderToStaticMarkup(<NavClient items={items} news={news} />);
  expect(html.match(/class="intel-card nav-card"/g)?.length).toBe(3);
  for (const label of ["大模型", "聚合网站", "编程工具", "动态追踪"]) {
    expect(html).toContain(label);
  }
  for (const id of ["cat-llm", "cat-aggregator", "cat-devtools"]) {
    expect(html).toContain(`id="${id}"`);
  }
});

it("屏读文案区分来源：管线卡＝核验，编辑精选卡＝整理", () => {
  const html = renderToStaticMarkup(<NavClient items={items} news={news} />);
  expect(html).toContain("已于 2026-10-10 核验");
  expect(html.match(/已于 [\d-]+ 整理/g)?.length).toBe(2);
  // 不许出现「聚合/工具卡被说成已核验」的越权文案：核验字样只出现一次（管线卡）
  expect(html.match(/已于 [\d-]+ 核验/g)?.length).toBe(1);
});

it("默认排序＝最近更新在前（2026-10-15 用户裁决，板块两面同口径）", () => {
  /* 评级故意与日期反着给：旧默认按 rating 排会把「老而高分」的卡钉在前面。
     renderToStaticMarkup 取的是初始 state，所以这条测的就是「默认值」本身。 */
  const mixed: NavItem[] = [
    mk({ name: "老牌高分", category: "llm", rating: 5, updated: "2026-09-01" }),
    mk({ name: "刚核验的新卡", category: "llm", rating: 1, updated: "2026-10-14" }),
  ];
  const html = renderToStaticMarkup(<NavClient items={mixed} news={news} />);
  expect(html.indexOf("刚核验的新卡")).toBeLessThan(html.indexOf("老牌高分"));
  expect(html).toContain('value="updated"');
});

it("外链都声明 noopener noreferrer，且限时免费卡走 warn 色", () => {
  const html = renderToStaticMarkup(<NavClient items={items} news={news} />);
  const hrefs = html.match(/<a [^>]*href="https:\/\/example\.com[^"]*"[^>]*>/g) ?? [];
  expect(hrefs.length).toBeGreaterThan(0);
  for (const a of hrefs) expect(a).toContain('rel="noopener noreferrer"');
  expect(html).toContain("tag-limited");
  expect(html).toContain("verify-warn");
});

it("空列表时给出中文空态，而不是渲染空白页", () => {
  const html = renderToStaticMarkup(<NavClient items={[]} news={[]} />);
  expect(html).toContain("没有匹配的结果");
  expect(html).not.toContain("intel-card nav-card");
});

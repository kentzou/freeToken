/** 导航频道数据加载（构建期一次性读取，静态导出无运行时请求）。
 *  与 data.server.ts 解耦：导航数据独立于情报管线，互不影响；
 *  门户层数据（nav.json 人工精选）与爬取层（nav-index.json）在此合并。
 *  只读 data/nav-index.json 的一个子集字段，避免把 1.6MB 全量塞进每个页面。 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** 精简条目：前端展示与筛选所需的全部字段（与 pipeline.finalize 输出对齐）。 */
export interface NavTool {
  id: string;
  name: string;
  desc: string;
  url: string;
  logo: string;
  category: string;
  categoryName: string;
  tags: string[];
  pricing: "free" | "freemium" | "paid" | "unknown";
  pricingInferred: boolean;
  sourceCount: number;
  firstSeen: string;
  lastSeen: string;
  tier: "crawled" | "verified";
  /** 上游原始分类名全集（合并去重后）。展示"来源站把该工具归入了哪些栏目"这一可证实事实。 */
  rawCategories?: string[];
  sources: { siteId: string; detailUrl: string; fetchedAt: string; rawCategory: string; directLink?: boolean }[];
}

export interface NavCategory {
  slug: string;
  name: string;
  count: number;
}

export interface NavSiteMeta {
  siteId: string;
  name: string;
  home: string;
  enabled: boolean;
  tier: number;
  note: string;
  status: "ok" | "empty" | "skipped";
  count: number;
}

export interface NavIndex {
  updated: string;
  generatedAt: string;
  sourceFetchedAt: string;
  stats: { total: number; rawTotal: number; dedupRemoved: number; siteCount: number; skippedCount: number };
  categories: NavCategory[];
  tagCounts: Record<string, number>;
  siteCounts: Record<string, number>;
  sites: NavSiteMeta[];
  items: NavTool[];
}

/** 人工精选层（data/nav.json）：先前的 23 条编辑整理条目，标 tier=verified 置顶。 */
interface NavJsonItem {
  name: string;
  desc: string;
  link: string;
  tags: string[];
  freeTier: boolean;
  rating: number;
  updated: string;
}
interface NavJson {
  aggregators: NavJsonItem[];
  devtools: NavJsonItem[];
}

let cache: NavIndex | null = null;

/** 载入爬取层索引（宽容读取：文件缺失返回空结构，构建不因它红）。 */
export function loadNavIndex(cwd: string = process.cwd()): NavIndex {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(path.resolve(cwd, "data/nav-index.json"), "utf8")) as NavIndex;
  } catch {
    cache = {
      updated: "",
      generatedAt: "",
      sourceFetchedAt: "",
      stats: { total: 0, rawTotal: 0, dedupRemoved: 0, siteCount: 0, skippedCount: 0 },
      categories: [],
      tagCounts: {},
      siteCounts: {},
      sites: [],
      items: [],
    };
  }
  return cache;
}

/** 载入人工精选层，映射为 NavTool（tier=verified 置顶显示）。 */
export function loadFeatured(cwd: string = process.cwd()): NavTool[] {
  try {
    const raw = JSON.parse(readFileSync(path.resolve(cwd, "data/nav.json"), "utf8")) as NavJson;
    const all = [...(raw.aggregators || []), ...(raw.devtools || [])];
    return all.map((a) => ({
      id: `featured-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: a.name,
      desc: a.desc,
      url: a.link,
      logo: "",
      category: "featured",
      categoryName: "编辑精选",
      tags: a.tags || [],
      pricing: a.freeTier ? "free" : "unknown",
      pricingInferred: false,
      sourceCount: 1,
      firstSeen: a.updated,
      lastSeen: a.updated,
      tier: "verified" as const,
      sources: [],
    }));
  } catch {
    return [];
  }
}

/** 合并后的完整工具列表（精选层置顶）。 */
export function loadNavTools(cwd: string = process.cwd()): { items: NavTool[]; index: NavIndex; featured: NavTool[] } {
  const index = loadNavIndex(cwd);
  const featured = loadFeatured(cwd);
  return { items: [...featured, ...index.items], index, featured };
}

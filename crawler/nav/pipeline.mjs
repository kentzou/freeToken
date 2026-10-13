/** 导航数据管线：raw → 清洗 → 去重 → 分类 → 索引 → data/nav-index.json。
 *  职责单一：只读 data/raw/，只写 data/nav-sites.json（全量）与 data/nav-index.json（前端精简）。
 *  不感知爬取实现（crawler 解耦），不感知前端（site 解耦）。
 *  用法：node crawler/nav/pipeline.mjs */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { CATEGORIES, classify, extractTags, inferPricing } from "./lib/classify.mjs";
import { NAV_SITES } from "./sites.mjs";

const ROOT = path.resolve(process.cwd());
const RAW_DIR = path.join(ROOT, "data", "raw");
const DATA_DIR = path.join(ROOT, "data");

/** 清洗 URL：去首尾空白（实测上游 HTML 属性存在前导空格，如 " https://…"），
 *  并且**只留 origin + pathname**——查询串与锚点一律不入库。
 *
 *  为什么整串砍掉而不是逐键剔除（情报卡那条链用的是 crawler/clean.mjs 的 PROMO_KEYS 白名单式
 *  清洗，那边不能照搬）：情报卡的 link 是站长逐张声明的官方落地页，参数含义可证；
 *  导航层的链是别人站点上的跳转链，参数是目录站与厂商私下谈的分销/归因码，无人核验过。
 *  实测 data/nav-index.json 1928 条里 995 条带查询串：utm_source 684、ref 82、from 38，
 *  另有 identity / channel / channelCode / via / code / inviteCode / huiwaInviteCode / pic / vd /
 *  sqm / spm / track_id 等数十种，逐键黑名单必然漏（`pic=g5DP`、`vd=qFokWH` 这类根本猜不出是码）。
 *  留下任何一个等于替第三方目录递引流，直接违反「精选门槛与收录标准」页公示的
 *  「上游作者的邀请码池与推广短链一律不入库」，也会被 tests/build-output.test.mjs
 *  的产物零引流红线当场判红。目录卡的职责是「走到这个工具的官网」，砍到 origin+pathname 不损伤职责。
 *  原始完整地址仍在 data/raw/（本地抓取产物，未入库），需要复查溯源时由它兜底。 */
/* 分销跳转域改写表：这类短链把分销码写在**路径**里（https://<品牌>.cgref.cn/s/<码>），
   上面那条「整串砍到 origin+pathname」对它无效——砍掉查询串后剩下的仍是一枚活的分销入口
   （实测访问一次即种一次归因）。所以按 host+pathname 命中后整条换成逐条取证过的官方地址。
   表入库（crawler/nav/link-overrides.json，30 条各带 landedWithParams / officialTitle 等实证字段）；
   清洗落在管线层而不是改 data/raw/：raw 是未入库的抓取产物，每次重爬都会把短链原样带回来。
   缺表直接抛错而不是静默放行：表一旦被删，产物会原样带出分销入口，而产物红线
   tests/build-output.test.mjs「nav 面外链零推广跳转域」扫的正是这个。 */
const OVERRIDE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "link-overrides.json");
if (!existsSync(OVERRIDE_FILE)) throw new Error(`缺外链改写表：${OVERRIDE_FILE}`);
/** 改写键：host + pathname（小写、去尾斜杠）——与 cleanUrl 的输出形态同构，两边才可能对得上。 */
function overrideKey(u) {
  const t = String(u || "").trim();
  if (!t) return "";
  try {
    const url = new URL(t);
    return `${url.host}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return t.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  }
}
const LINK_OVERRIDES = new Map(
  JSON.parse(readFileSync(OVERRIDE_FILE, "utf8")).entries.map((e) => [overrideKey(e.affiliate), e.official])
);

function cleanUrl(u) {
  const t = String(u || "").trim();
  if (!t) return "";
  try {
    const url = new URL(t);
    url.search = "";
    url.hash = "";
    /* 先砍参数得到可比对的 host+path，再查改写表；命中则整条换成官方地址 */
    return LINK_OVERRIDES.get(overrideKey(url)) || url.toString();
  } catch {
    /* 裸域名/相对形态 new URL 必失败，按字符切掉 ? 与 # 兜底 */
    return t.split(/[?#]/)[0];
  }
}

/** 域名字符归一：去 www./m./协议/尾斜杠/查询串，用于去重。 */
export function normalizeUrl(u) {
  const t = cleanUrl(u);
  if (!t) return "";
  try {
    const url = new URL(t);
    const host = url.host.replace(/^(www|m|go)\./i, "");
    return `${host}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return t.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

/** slug 生成：用域名（唯一性最好），但**必须剔掉点号**——slug 落在 URL 路径段里，
 *  含 `.` 会被部分静态托管/CDN 当成文件扩展名解析，引发路由 404 或错误重定向。
 *  中文名无法可靠音译，故仍以 host 为基底。 */
export function slugify(name, url) {
  const norm = normalizeUrl(url);
  const host = norm.split("/")[0];
  if (host) return host.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool";
}

/** 名称归一：小写、去空格与常见后缀，用于同名判定。 */
const normName = (s) => String(s || "").toLowerCase().replace(/[\s\-_（）()【】\[\]]/g, "");

/** 去重：优先按归一化 URL（同一官网即同一工具）；无 URL 时按归一化名称。
 *  多来源命中时合并 sources，保留信息更全的一条作主记录。 */
export function dedupe(tools) {
  const byUrl = new Map();
  const byName = new Map();
  const out = [];

  for (const t of tools) {
    const nu = normalizeUrl(t.externalUrl);
    const nn = normName(t.rawName);
    const hit = (nu && byUrl.get(nu)) || (!nu && nn && byName.get(nn));
    if (hit) {
      // 合并来源：**同站点只算一条**（上游一工具可能挂多个分类，产生同站多条记录）。
      // 但该站的全部原始分类要并进 rawCategories，不能丢——分类信息比"来源条数"更有价值。
      const existing = hit.sources.find((s) => s.siteId === t.siteId);
      if (existing) {
        if (t.rawCategory && !hit.rawCategories.includes(t.rawCategory)) hit.rawCategories.push(t.rawCategory);
        // 若新记录有站内详情页而旧的是直链，升级为详情页（溯源价值更高）
        if (existing.directLink !== false && t.detailUrl && t.detailUrl !== existing.detailUrl) {
          if (!t.externalUrl || t.detailUrl !== t.externalUrl) existing.detailUrl = t.detailUrl;
        }
      } else {
        hit.sources.push({ siteId: t.siteId, detailUrl: t.detailUrl, fetchedAt: t.fetchedAt, rawCategory: t.rawCategory });
        if (t.rawCategory) hit.rawCategories.push(t.rawCategory);
      }
      if ((t.rawDesc || "").length > (hit.desc || "").length) hit.desc = t.rawDesc;
      if (!hit.logo && t.logo) hit.logo = t.logo;
      continue;
    }
    const rec = {
      name: t.rawName,
      desc: t.rawDesc,
      url: cleanUrl(t.externalUrl) || cleanUrl(t.detailUrl),
      logo: t.logo,
      rawCategories: t.rawCategory ? [t.rawCategory] : [],
      sources: [{ siteId: t.siteId, detailUrl: t.detailUrl, fetchedAt: t.fetchedAt, rawCategory: t.rawCategory }],
      firstSeen: t.fetchedAt,
      lastSeen: t.fetchedAt,
    };
    out.push(rec);
    if (nu) byUrl.set(nu, rec);
    else if (nn) byName.set(nn, rec);
  }
  return out;
}

/** 单条记录 → 前端精简条目（补分类/标签/定价/slug）。 */
function finalize(rec) {
  const catText = rec.rawCategories.join(" ");
  const cat = classify(rec.rawCategories, `${rec.name} ${rec.desc}`);
  const tags = extractTags(catText, rec.desc, rec.name);
  const pricing = inferPricing(rec.desc, catText);
  return {
    id: slugify(rec.name, rec.url),
    name: rec.name,
    desc: rec.desc,
    url: rec.url,
    logo: rec.logo,
    category: cat,
    categoryName: CATEGORIES[cat] || "其他",
    tags,
    pricing,
    pricingInferred: true, // 定价为文本推断，UI 必须标注
    sourceCount: rec.sources.length,
    firstSeen: rec.firstSeen,
    lastSeen: rec.lastSeen,
    tier: "crawled", // 爬取收录层；编辑核验层由 nav.json 单独提供
    /* 上游原始分类名（合并去重后的全集）。用于详情页溯源展示：
       "该工具在来源站被归入哪些栏目" —— 这是可证实的原始事实，比本站归类更有溯源价值。 */
    rawCategories: [...new Set(rec.rawCategories)],
    /* 溯源语义标记：来源站用「直链模式」时（卡片 href 直接指向外站、无站内详情页），
       实测 aigc.cn 全部 847 条第如此、ai-bot.cn 少数条目如此。
       这不是抓取错误而是站点真实结构，故不修正，但 UI 需如实区分展示。 */
    /* 溯源链接分两种形态：directLink 时 detailUrl 就是外站跳转链，与 url 同政策清洗（它带着同一批分销码）；
       非 directLink 时它是来源站的站内详情页——那是「这条记录从哪儿抓的」的证据，不是本站的引流出口，原样留。 */
    sources: rec.sources.map((s) => {
      const direct = normalizeUrl(s.detailUrl) === normalizeUrl(rec.url);
      return { ...s, detailUrl: direct ? cleanUrl(s.detailUrl) : s.detailUrl, directLink: direct };
    }),
  };
}

/** 读 raw 目录全部站点文件。 */
function loadRaw() {
  if (!existsSync(RAW_DIR)) return { tools: [], files: [] };
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const tools = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(path.join(RAW_DIR, f), "utf8"));
    if (Array.isArray(d.tools)) tools.push(...d.tools);
  }
  return { tools, files };
}

/** 主流程 */
export function build() {
  const { tools: raw, files } = loadRaw();
  const merged = dedupe(raw);
  const items = merged.map(finalize);

  // 同 slug 冲突（不同工具落在同一域名）时加序号后缀，保证详情页路由唯一
  const slugCount = new Map();
  for (const it of items) {
    const n = (slugCount.get(it.id) || 0) + 1;
    slugCount.set(it.id, n);
    if (n > 1) it.id = `${it.id}-${n}`;
  }

  // 预计算索引：分类计数、来源计数、标签词频（前端零计算即可渲染）
  const catCounts = {};
  for (const it of items) catCounts[it.category] = (catCounts[it.category] || 0) + 1;
  const tagCounts = {};
  for (const it of items) for (const t of it.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const sourceCounts = {};
  for (const it of items) for (const s of it.sources) sourceCounts[s.siteId] = (sourceCounts[s.siteId] || 0) + 1;

  const report = existsSync(path.join(RAW_DIR, "_report.json"))
    ? JSON.parse(readFileSync(path.join(RAW_DIR, "_report.json"), "utf8"))
    : { crawled: [], skipped: [], fetchedAt: "" };

  const sitesMeta = NAV_SITES.map((s) => ({
    siteId: s.id,
    name: s.name,
    home: s.home,
    enabled: s.enabled,
    tier: s.tier,
    note: s.enabled ? s.note || "" : s.skipReason || "",
    status: s.enabled ? (sourceCounts[s.id] ? "ok" : "empty") : "skipped",
    count: sourceCounts[s.id] || 0,
  }));

  const index = {
    updated: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    sourceFetchedAt: report.fetchedAt || "",
    stats: {
      total: items.length,
      rawTotal: raw.length,
      dedupRemoved: raw.length - items.length,
      siteCount: sitesMeta.filter((s) => s.status === "ok").length,
      skippedCount: sitesMeta.filter((s) => s.status === "skipped").length,
    },
    categories: Object.entries(CATEGORIES).map(([slug, name]) => ({ slug, name, count: catCounts[slug] || 0 })),
    tagCounts,
    siteCounts: sourceCounts,
    sites: sitesMeta,
    items,
  };

  writeFileSync(path.join(DATA_DIR, "nav-sites.json"), JSON.stringify({ ...index, items: merged }, null, 2) + "\n");
  writeFileSync(path.join(DATA_DIR, "nav-index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idx = build();
  const s = idx.stats;
  console.log(`管线完成：raw ${s.rawTotal} 条 → 去重后 ${s.total} 条（合并 ${s.dedupRemoved} 条重复）`);
  console.log(`分类分布：`);
  for (const c of idx.categories) if (c.count) console.log(`  ${c.name}: ${c.count}`);
  console.log(`来源站：成功 ${s.siteCount} 站，跳过 ${s.skippedCount} 站`);
}

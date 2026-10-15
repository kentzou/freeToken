/** iGetoken 活动快讯台账（第四数据源，与 tokens 管线 / openrouter 台账 / igetoken 线索台账均解耦，
 *  不进两队列审核）。
 *  与 crawler/igetoken.mjs 的分工（同域名、两本账，刻意分文件分数据分 workflow）：
 *  那份抓 /models/ 卡片页产「线索台账」（不渲染、不发布）；本文件抓 /deals/ 栏目的官方 RSS
 *  产「可发布跳转索引」——用户点名的活动快讯就是 /deals/ 这一栏目。
 *  取数口径：https://igetoken.com/deals/ 页脚明示的订阅入口 /rss.xml——比解析页面 HTML 少一层
 *  改版脆弱性：HTML 改版会静默丢条目，RSS 形态变化会触发 fail-stop，响亮得多。
 *  版权红线：只持久化「标题 + 原文链接 + 日期」三项事实元数据，RSS <description> 与原文正文
 *  一律不落盘；站内页面 /igetoken/ 是带来源标注的跳转索引，读者点标题回 iGetoken 读原文。
 *  出网口复用 crawler/nav/lib/http.mjs 的 grabText（全站唯一带 UA、域级限速、重试退避的 fetch面），
 *  本文件不另立一套 HTTP。 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { grabText } from "./nav/lib/http.mjs";

export const IGETOKEN_RSS_URL = "https://igetoken.com/rss.xml";
/** deals 条目判据：RSS 是「上新速报」混排三栏目（实测 2026-10-15：/deals/ 58 条、/models/ 21、/perks/ 8），
 *  本台账只收 /deals/。 */
export const IGETOKEN_DEAL_LINK = /^https:\/\/igetoken\.com\/deals\/[^\s"]+\/$/;

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/g, (m, k) => (k in NAMED ? NAMED[k] : m));

/** rss.xml 文本 → 规范化台账文档。纯函数：不碰网络与磁盘，注入文本即可全测。
 *  守卫全部 fail-stop（对齐 extract.mjs 的「解析了一半 ≠ 上游清空了」）：
 *  顶层无 <rss>/<item>（改版或被拦截成验证页）、deals 条目缺 title、pubDate 不可解析、
 *  deals 条目为 0——任一命中就抛，让调用方保留旧文件。 */
export function parseDeals(xml, { now }) {
  if (typeof xml !== "string" || !xml.includes("<rss") || !xml.includes("<item>")) {
    throw new Error("igetoken rss 形态异常：缺 <rss> 或 <item>（上游改版/被拦截，拒绝写盘）");
  }
  const field = (b, t) => {
    const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
    return m ? decodeXml(m[1].trim()) : "";
  };
  const items = [];
  for (const [, b] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = field(b, "link");
    if (!IGETOKEN_DEAL_LINK.test(link)) continue; // 混排的 /models/ /perks/ 条目原样跳过
    const title = field(b, "title");
    if (!title) throw new Error(`igetoken rss 形态异常：deals 条目缺 title（${link}）`);
    const d = new Date(field(b, "pubDate"));
    if (Number.isNaN(d.getTime())) throw new Error(`igetoken rss 形态异常：pubDate 不可解析（${link}）`);
    items.push({ id: link.split("/").filter(Boolean).pop(), date: d.toISOString().slice(0, 10), title, link });
  }
  if (items.length === 0) throw new Error("igetoken rss 异常：deals 条目为 0（收录口径已变，拒绝写盘）");
  // date 降序、同日按 link 升序定序：每日 diff 只反映真实增删，与 openrouter 台账同律
  items.sort((a, z) => (a.date !== z.date ? (a.date < z.date ? 1 : -1) : a.link < z.link ? -1 : a.link > z.link ? 1 : 0));
  return {
    source: IGETOKEN_RSS_URL,
    sourceName: "iGetoken 活动快讯",
    rightsNote: "本站仅登记标题与原文链接，正文版权归原作者；点击标题跳转 iGetoken 阅读。",
    fetchedAt: now,
    itemCount: items.length,
    items,
  };
}

/** 编排：抓 RSS → 解析 → 产出「路径 → 文本」。不落盘（落盘交给 CLI，与 openrouter.mjs 同形）。 */
export async function crawlIgetokenDeals({ grab = grabText, now = new Date().toISOString() } = {}) {
  const r = await grab(IGETOKEN_RSS_URL);
  if (!r.ok) throw new Error(`igetoken rss HTTP 失败：${r.error || `HTTP ${r.status}`}`);
  const doc = parseDeals(r.text, { now });
  return { doc, files: { "data/igetoken-deals.json": JSON.stringify(doc, null, 2) + "\n" } };
}

/* 底部 CLI：真 fs 接线（与 openrouter.mjs 同形）。git 操作在 workflow 里判差提交，本机跑只更新工作区文件。 */
async function main() {
  const root = process.cwd();
  let summary;
  try {
    summary = await crawlIgetokenDeals();
  } catch (e) {
    // fail-stop：报错退出，旧文件保持不动（宁要昨天的真数据，不要今天的空数据）
    console.error(`deals 抓取中止：${e.message}（data/igetoken-deals.json 未改动）`);
    process.exitCode = 1;
    return;
  }
  const { doc, files } = summary;
  const rel = "data/igetoken-deals.json";
  const abs = path.resolve(root, rel);
  let delta = "首次抓取";
  if (existsSync(abs)) {
    try {
      const prev = new Set(JSON.parse(readFileSync(abs, "utf8")).items.map((i) => i.id));
      const nowIds = new Set(doc.items.map((i) => i.id));
      const added = doc.items.filter((i) => !prev.has(i.id)).map((i) => i.id);
      const removed = [...prev].filter((id) => !nowIds.has(id));
      delta = `新增 ${added.length} · 下架 ${removed.length}`;
    } catch {
      delta = "旧文件不可解析，整份覆盖";
    }
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  // 先写临时名再原子替换：抓取中断不会留下半截 JSON 污染下一次 diff
  writeFileSync(abs + ".tmp", files[rel]);
  renameSync(abs + ".tmp", abs);
  console.log(`deals 完成：${doc.itemCount} 条 · ${delta} · 抓取于 ${doc.fetchedAt}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

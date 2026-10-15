/** iGetoken「Agent 福利社」积分台账（第五数据源，与 tokens 管线 / openrouter / igetoken 线索台账 /
 *  igetoken-deals 活动快讯四本账一样解耦：不进两队列审核、不进 pending、不渲染成站内正文）。
 *  与 crawler/igetoken.mjs 的分工（同域名、刻意分文件分数据分 workflow）：那份抓 /models/ 的
 *  免费 API 额度线索，本文件抓 /perks/ 的签到/积分福利——用户点名的 URL 就是后者。
 *  定位红线（2026-10-15 实测，出处页顶栏原话）：/perks/ 是「产品内积分」，页面自己声明它
 *  「与本站『免费 API Token』是两类东西——积分不能导出为 API Key」。所以本台账只当**线索**登记，
 *  绝不等额度类情报；要进主卡片区必须逐条回打厂商官方页取证后手写 config/local-cards.json
 *  （data/tokens.json 直写的条目下一轮 crawl 会被重铸判成「上游已删除」，见 local-cards.mjs 顶部口径）。
 *  取数口径：抓 HTML 而非 RSS——实测 2026-10-15 rss.xml 的 /perks/ 只有 8 条（速报流），
 *  列表页是全集 12 条，且只有列表页带「MM/DD 已核实」与直达厂商官网的领取链接。
 *  改版防线不靠正则准，靠三处 fail-stop：网格锚点、页面自述的「共 N 个产品」与解析条数对账、
 *  每卡必备字段与类别集合（类别集合取自页面自己的 filter-tabs，对方加档时自动跟）。 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { grabText } from "./nav/lib/http.mjs";
import { cleanText } from "./nav/lib/parse.mjs";

export const IGETOKEN_PERKS_URL = "https://igetoken.com/perks/";

/** 一张卡 = 一个带 data-category 的 div 紧跟一个 <a>（站内唯一形态，实测 12/12 命中）。 */
const CARD_RE = /<div data-category="([^"]+)"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

/** 首个匹配 → 纯文本（cleanText＝nav/lib/parse.mjs 的全站唯一 HTML 文本清洗，不另立第二套）；
 *  没匹配返回空串，必填校验交给调用方，解析层不做二重抛错口径。 */
const field = (body, re) => {
  const m = body.match(re);
  return m ? cleanText(m[1]) : "";
};

/** /perks/ 页面 HTML → 规范化台账文档。纯函数：不碰网络与磁盘，注入文本即可全测。
 *  守卫全部 fail-stop（对齐 igetoken-deals.mjs 的「解析了一半 ≠ 上游清空了」）。 */
export function parsePerks(html, { now }) {
  if (typeof html !== "string" || !html.includes('id="perks-grid"')) {
    throw new Error("igetoken /perks 形态异常：找不到 #perks-grid（对方已改版，解析器要跟着改）");
  }
  // 顶栏定位声明原句：既是「这批内容属不属于本站口径」的判据，也是给读者的披露——删了就抛
  const scopeNote = field(html, /<h1[^>]*>[\s\S]*?<\/h1>\s*<p class="[^"]*text-slate-500[^"]*">([\s\S]*?)<\/p>/);
  if (!scopeNote) throw new Error("igetoken /perks 形态异常：h1 后取不到定位声明段（栏目改写或改版）");
  const declared = scopeNote.match(/共\s*(\d+)\s*个产品/);
  if (!declared) throw new Error(`igetoken /perks 形态异常：定位声明里读不到「共 N 个产品」（原文：${scopeNote.slice(0, 40)}）`);

  // 类别合法集取自页面自己的筛选档位（除 all）：对方新增一档时这里自动放宽，不必改代码
  const tabs = [...html.matchAll(/data-filter="([^"]+)"/g)].map((m) => m[1]).filter((v) => v !== "all");
  if (tabs.length === 0) throw new Error("igetoken /perks 形态异常：读不到任何 filter 档位");

  const items = [];
  for (const [, category, href, body] of html.matchAll(CARD_RE)) {
    if (!tabs.includes(category)) {
      throw new Error(`igetoken /perks 形态异常：卡片类别 ${category} 不在页面档位 ${tabs.join("/")} 内`);
    }
    const name = field(body, /<span class="rounded-md bg-slate-900[^"]*">([\s\S]*?)<\/span>/);
    const label = field(body, /<span class="rounded-md bg-slate-100[^"]*">([\s\S]*?)<\/span>/);
    // 领取链接实测有「A 与 B」写在同一个 href 里的上游脏数据（atomgit 那张），按 URL 全收不做取舍
    const links = [...href.matchAll(/https?:\/\/\S+/g)].map((m) => cleanText(m[0]));
    const terms = [...body.matchAll(/<span>([^<]*)<\/span>/g)]
      .map((m) => cleanText(m[1]))
      .filter((v) => v && v !== "·")
      .join(" · ");
    const item = {
      // 身份键不能只用 name：实测国内版「WorkBuddy」同时挂 student 与 signin 两张卡，
      // 按 name 做差集会把两张并成一张，新增/下架读数就撒谎。与 igetoken-deals 的 id 同律。
      id: `${name}|${category}`,
      name,
      category,
      categoryLabel: label,
      title: field(body, /<h3[^>]*>([\s\S]*?)<\/h3>/),
      quota: field(body, /<p class="[^"]*text-emerald-700[^"]*">([\s\S]*?)<\/p>/),
      summary: field(body, /<p class="mt-2[^"]*text-slate-500[^"]*">([\s\S]*?)<\/p>/),
      terms,
      disclaimer: field(body, /<p class="[^"]*border-t[^"]*text-slate-400[^"]*">([\s\S]*?)<\/p>/),
      checkedAt: field(body, /<span class="text-xs text-slate-400">([^<]*已核实)/),
      links,
    };
    for (const k of ["name", "title", "quota", "disclaimer", "checkedAt"]) {
      if (!item[k]) throw new Error(`igetoken /perks 形态异常：${item.name || category} 这张卡缺 ${k}`);
    }
    if (item.links.length === 0) throw new Error(`igetoken /perks 形态异常：${item.name} 的领取链接不是 https 地址`);
    items.push(item);
  }
  if (items.length === 0) throw new Error("igetoken /perks 异常：0 张卡片（判据已变，拒绝写盘）");
  if (items.length !== Number(declared[1])) {
    throw new Error(`igetoken /perks 形态异常：解析 ${items.length} 张，页面自述 ${declared[1]} 个产品（必有一张卡没被认出来，拒绝静默丢）`);
  }
  // id 同名同档两张＝上游把一张卡复制了，差集会把两张并成一张 ⇒ 响亮拒绝，不产会撒谎的台账
  const dup = items.findIndex((it, i) => items.findIndex((x) => x.id === it.id) !== i);
  if (dup >= 0) throw new Error(`igetoken /perks 形态异常：${items[dup].id} 这张卡重复出现（同名同档两张，身份键失效）`);
  // 按 id 定序（UTF-16 码序，跨机确定）：与 openrouter 台账同律，每日 diff 只反映真实增删
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    source: IGETOKEN_PERKS_URL,
    sourceName: "iGetoken Agent 福利社",
    // 定位不是我们贴的标签，是把出处页的自我声明原句带回来——它变了，收录口径就得重议
    scopeNote,
    rightsNote: "本站仅登记条目原文与厂商链接，文案版权归原作者；进主卡片区前须逐条回打厂商官方页取证。",
    fetchedAt: now,
    declaredCount: Number(declared[1]),
    itemCount: items.length,
    items,
    // 内容指纹：只对「台账真正收录的那部分」（定位声明 + 定序后的卡片）取 sha256(16)。
    // 刻意不 hash 整页字节——实测同一批 12 条内容连抓两次整页 sha 就不同：页面里有 Cloudflare
    // 邮箱混淆（/cdn-cgi/l/email-protection#… 与 data-cfemail=…），那串是每请求随机编码的，
    // hash 整页会天天假报警。改对内容取指纹后，这个值变化才等于「上游真改了东西」。
    // 键必须写在返回体内而不是编排层补：补出来的键 tsc 看不到，deploy 的 npx tsc --noEmit 会因此红灯。
    sourceFingerprint: createHash("sha256").update(JSON.stringify({ scopeNote, items })).digest("hex").slice(0, 16),
  };
}

/** 编排：抓页面 → 解析 → 产出「路径 → 文本」。不落盘（落盘交给 CLI，与 igetoken-deals.mjs 同形）。 */
export async function crawlIgetokenPerks({ grab = grabText, now = new Date().toISOString() } = {}) {
  const r = await grab(IGETOKEN_PERKS_URL);
  if (!r.ok) throw new Error(`igetoken /perks HTTP 失败：${r.error || `HTTP ${r.status}`}`);
  const doc = parsePerks(r.text, { now });
  return { doc, files: { "data/igetoken-perks.json": JSON.stringify(doc, null, 2) + "\n" } };
}

/* 底部 CLI：真 fs 接线（与 openrouter.mjs 同形）。git 操作在 workflow 里判差提交，本机跑只更新工作区文件。 */
async function main() {
  const root = process.cwd();
  const rel = "data/igetoken-perks.json";
  let summary;
  try {
    summary = await crawlIgetokenPerks();
  } catch (e) {
    // fail-stop：报错退出，旧文件保持不动（宁要昨天的真数据，不要今天的空数据）
    console.error(`perks 抓取中止：${e.message}（${rel} 未改动）`);
    process.exitCode = 1;
    return;
  }
  const { doc, files } = summary;
  const abs = path.resolve(root, rel);
  let delta = "首次抓取";
  if (existsSync(abs)) {
    try {
      const prev = new Set(JSON.parse(readFileSync(abs, "utf8")).items.map((i) => i.id));
      const nowIds = new Set(doc.items.map((i) => i.id));
      const added = doc.items.filter((i) => !prev.has(i.id)).map((i) => i.id);
      const removed = [...prev].filter((id) => !nowIds.has(id));
      delta = `新增 ${added.length} · 下架 ${removed.length}${added.length ? `（+${added.join("、")}）` : ""}${removed.length ? `（-${removed.join("、")}）` : ""}`;
    } catch {
      delta = "旧文件不可解析，整份覆盖";
    }
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  // 先写临时名再原子替换：抓取中断不会留下半截 JSON 污染下一次 diff
  writeFileSync(abs + ".tmp", files[rel]);
  renameSync(abs + ".tmp", abs);
  console.log(`perks 完成：${doc.itemCount}/${doc.declaredCount} 条 · ${delta} · 指纹 ${doc.sourceFingerprint}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

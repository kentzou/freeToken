/** iGetoken「免费资源库」/models/ 免费 API 额度线索台账（第二个 igetoken 抓取件）。
 *  与同域另两件的分工（刻意分文件分数据分 workflow，2026-10-15 三家并存）：
 *  crawler/igetoken.mjs＝本文件抓 /models/ 的**常驻平台清单**（47 家，额度口径逐字抄回），
 *  crawler/igetoken-deals.mjs 抓官方 RSS 的**上新快讯**（只登记标题+链接+日期的跳转索引），
 *  crawler/igetoken-perks.mjs 抓 /perks/ 的**产品内积分**（对方页面自己声明积分不能导出为 API Key）。
 *  定位红线：本文件只产 data/igetoken.json，绝不写 data/tokens.json | donots.json | rules.json，
 *  也绝不写 config/local-cards.json——所以它不进 syncOnce 两队列、绕得开决策 #7。
 *  为什么绝不能直写 data/tokens.json：igetoken 是与本站同赛道的第三方聚合站，卡片文案是别人家的
 *  编辑产物，未过红线②（2026-10-14 口径：额度原句须在**厂商官方页**任一份字节里逐字在场）；
 *  要变成卡片必须逐条回官方页取证后手写 config/local-cards.json（skill 段 1 → 段 2）。
 *  取数口径：抓 HTML 而非 RSS——/models/ 是全集（实测 47 家），RSS 的 models 栏目只收录「新上线」事件。
 *  出网口复用 crawler/nav/lib/http.mjs（全站唯一带 UA、域级限速 1.5s、重试退避的 fetch），不另立第二套。
 *  改版防线对齐 igetoken-perks.mjs 的三条：网格锚点 + 页面自述「共 N 个平台」与解析条数对账 +
 *  类别合法集取自页面自己的 filter 档位（对方加档时自动放宽，不必改代码）。 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { grabText } from "./nav/lib/http.mjs";
import { cleanText } from "./nav/lib/parse.mjs";

export const IGETOKEN_MODELS_URL = "https://igetoken.com/models/";

/** 一张卡 = 一个带 data-category 的 div 紧跟一个指向 /models/<slug>/ 的 <a>。
 *  必须收口到 </a>：整页切分时最后一张卡会把页脚吞进去（实测第 47 张段落数从 2 变 10）。 */
const CARD_RE = /<div data-category="([^"]+)"[^>]*>\s*<a href="(\/models\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

/** 首个匹配 → 纯文本（cleanText＝nav/lib/parse.mjs 的全站唯一 HTML 文本清洗，不另立第二套）；
 *  没匹配返回空串，必填校验交给调用方，解析层不做二重抛错口径。 */
const field = (body, re) => {
  const m = body.match(re);
  return m ? cleanText(m[1]) : "";
};

/** /models/ 页面 HTML → 规范化台账文档。纯函数：不碰网络与磁盘，注入文本即可全测。
 *  守卫全部 fail-stop（对齐 igetoken-perks.mjs 的「解析了一半 ≠ 上游清空了」）。 */
export function parsePlatforms(html, { now }) {
  if (typeof html !== "string" || !html.includes('id="models-grid"')) {
    throw new Error("igetoken /models 形态异常：找不到 #models-grid（对方已改版，解析器要跟着改）");
  }
  // 页面顶栏的自我定位原句（实测 2026-10-15：「共 47 个平台。每条都标注最后核实日期，额度以官方页面为准…」）：
  // 既是「共 N 个」对账锚点的来源，也是给对方口径留痕——它变了说明栏目改写，收录标准得重议。
  const scopeNote = field(html, /<h1[^>]*>[\s\S]*?<\/h1>\s*<p class="[^"]*text-slate-500[^"]*">([\s\S]*?)<\/p>/);
  const declared = scopeNote.match(/共\s*(\d+)\s*个平台/);
  if (!declared) throw new Error(`igetoken /models 形态异常：定位声明里读不到「共 N 个平台」（原文：${scopeNote.slice(0, 40)}）`);

  // 类别合法集取自页面自己的筛选档位（除 all）：对方新增一档时这里自动放宽，不必改代码
  const tabs = [...html.matchAll(/data-filter="([^"]+)"/g)].map((m) => m[1]).filter((v) => v !== "all");
  if (tabs.length === 0) throw new Error("igetoken /models 形态异常：读不到任何 filter 档位");

  const platforms = [];
  for (const [, category, url, body] of html.matchAll(CARD_RE)) {
    if (!tabs.includes(category)) {
      throw new Error(`igetoken /models 形态异常：卡片类别 ${category} 不在页面档位 ${tabs.join("/")} 内`);
    }
    // 两段 <p> 是卡片的承重结构（实测 47/47 恒为两段）：第 1 段平台简介、第 2 段额度口径。
    // 额度段用 text-emerald-700 认（与 igetoken-perks.mjs 同一锚），简介段用 mt-2 认。
    const summary = field(body, /<p class="mt-2[^"]*text-slate-500[^"]*">([\s\S]*?)<\/p>/);
    const quota = field(body, /<p class="[^"]*text-emerald-700[^"]*">([\s\S]*?)<\/p>/);
    const slug = cleanText(url).replace(/^\/models\/|\/$/g, "");
    const item = {
      slug,
      name: field(body, /<h3[^>]*>([\s\S]*?)<\/h3>/),
      category,
      url: new URL(url, IGETOKEN_MODELS_URL).href,
      summary,
      quota,
      tags: [...body.matchAll(/<span class="rounded-md bg-slate-100[^"]*">([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1])),
      // 这两个是「对方的口径」，原样抄、不换算成年份：badge 只有 MM/DD（无年），补年份要靠猜，
      // 猜错就把一条旧线索标成新核实。与 igetoken-perks.mjs 的 checkedAt 同律。
      checkedAt: field(body, /<span class="[^"]*rounded-full[^"]*">([^<]*已核实)/),
      rating: (body.match(/推荐指数\s*(\d)\s*\/\s*5/) || [])[1] || null,
    };
    // 必填清单不含 rating/tags：实测 TokenHarbor 那张就没有星级（对方没打分，不是我们没解析到）
    for (const k of ["slug", "name", "summary", "quota", "checkedAt"]) {
      if (!item[k]) throw new Error(`igetoken /models 形态异常：${item.name || url} 这张卡缺 ${k}`);
    }
    platforms.push(item);
  }
  if (platforms.length === 0) throw new Error("igetoken /models 异常：0 张卡片（判据已变，拒绝写盘）");
  if (platforms.length !== Number(declared[1])) {
    throw new Error(`igetoken /models 形态异常：解析 ${platforms.length} 张，页面自述 ${declared[1]} 个平台（必有一张卡没被认出来，拒绝静默丢）`);
  }
  // slug 重复＝差集会两张并一张，新增/消失读数就撒谎 ⇒ 响亮拒绝（与 igetoken-perks.mjs 的 dup 守卫同律）
  const dup = platforms.findIndex((p, i) => platforms.findIndex((x) => x.slug === p.slug) !== i);
  if (dup >= 0) throw new Error(`igetoken /models 形态异常：${platforms[dup].slug} 这张卡重复出现（身份键失效）`);
  // 按 slug 定序（UTF-16 码序，跨机确定）：与 openrouter / igetoken-perks 台账同律，每日 diff 只反映真实增删
  platforms.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  return {
    source: IGETOKEN_MODELS_URL,
    sourceName: "iGetoken 免费资源库",
    // 定位不是我们贴的标签，是把出处页的自我声明原句带回来——它变了，收录口径就得重议
    scopeNote,
    // 红线②写进产物本身：任何后来人（或下一个 agent）打开这份文件就先看到它不能直接发布
    usageNote: "线索台账，非发布内容。卡片文案来自同赛道第三方聚合站，未过本站红线②（额度原句须厂商官方页逐字在场）；要入库须逐条回官方页取证后手写 config/local-cards.json。",
    rightsNote: "本站仅登记条目原文与出处链接，文案版权归原作者；本页不替代厂商官方页。",
    evidence: "third-party-aggregator",
    fetchedAt: now,
    declaredCount: Number(declared[1]),
    platformCount: platforms.length,
    platforms,
    // 内容指纹只对「台账真正收录的那部分」（定位声明 + 定序后的卡片）取 sha256(16)，不对整页字节取。
    // 实测依据：同一页连抓两次（间隔 2 分钟）整页 sha 从 09c2832d 变成 3af03f20 而 47 张卡逐字全等——
    // 页面里有 Cloudflare 邮箱混淆（/cdn-cgi/l/email-protection#… 与 data-cfemail=…，实测 1+2 处），
    // 那串每请求随机编码；hash 整页会天天假报警，也就让「未变就不写盘」判空失效。
    sourceFingerprint: createHash("sha256").update(JSON.stringify({ scopeNote, platforms })).digest("hex").slice(0, 16),
  };
}

/** 编排：抓页面 → 解析 → 产出「路径 → 文本」。不落盘（落盘交给 CLI，与 igetoken-perks.mjs 同形）。 */
export async function crawlIgetokenModels({ grab = grabText, now = new Date().toISOString() } = {}) {
  const r = await grab(IGETOKEN_MODELS_URL);
  if (!r.ok) throw new Error(`igetoken /models HTTP 失败：${r.error || `HTTP ${r.status}`}`);
  const doc = parsePlatforms(r.text, { now });
  return { doc, files: { "data/igetoken.json": JSON.stringify(doc, null, 2) + "\n" } };
}

/* 底部 CLI：真 fs 接线（与 openrouter.mjs 同形）。刻意没有 git 操作，也不触发部署——见 workflow 注释。
 * 另：对方 rss.xml 实测 87 条带年份的上新速报，已由 crawler/igetoken-deals.mjs 收走，本文件不重复抓。 */
async function main() {
  const root = process.cwd();
  const rel = "data/igetoken.json";
  const abs = path.resolve(root, rel);
  let summary;
  try {
    summary = await crawlIgetokenModels();
  } catch (e) {
    // fail-stop：报错退出，旧文件保持不动（宁要昨天的真数据，不要今天的空数据）
    console.error(`igetoken /models 抓取中止：${e.message}（${rel} 未改动）`);
    process.exitCode = 1;
    return;
  }
  const { doc, files } = summary;

  // 读旧账一次：坏了或不存在都按「没有基底」处理，整份覆盖，不阻断
  let delta = "首次抓取";
  let prev = null;
  if (existsSync(abs)) {
    try {
      prev = JSON.parse(readFileSync(abs, "utf8"));
    } catch {
      delta = "旧文件不可解析，整份覆盖";
    }
  }
  /* 内容指纹相同 → 整份不写盘（连 fetchedAt 都不前进），workflow 的 git diff --cached --quiet 自然跳过。
   * 这条判空是必需的而不是优化：对方页面带每请求随机的 Cloudflare 混淆串，
   * 只要写盘就有差 ⇒ 本 job 每天必落一条 27 KB 提交，把「额度文案变了」这个唯一有用的信号埋在噪音里。
   * 判空留在代码里而不是 YAML，遵 run.mjs 的门训「workflow YAML 零逻辑——线上与本地跑同一份代码」。 */
  if (prev && prev.sourceFingerprint === doc.sourceFingerprint) {
    console.log(`igetoken /models 未变：${doc.platformCount} 家与 ${rel} 逐字相同，不写盘（指纹 ${doc.sourceFingerprint}）`);
    return;
  }

  if (prev) {
    const before = new Map((prev.platforms || []).map((p) => [p.slug, p]));
    const added = doc.platforms.filter((p) => !before.has(p.slug)).map((p) => p.slug);
    const gone = [...before.keys()].filter((s) => !doc.platforms.some((p) => p.slug === s));
    // 额度文案变了＝对方改过口径（或本站解析器该修了），这是这份台账最值钱的信号
    const rewritten = doc.platforms.filter((p) => before.has(p.slug) && before.get(p.slug).quota !== p.quota).map((p) => p.slug);
    delta = `新增 ${added.length} · 消失 ${gone.length} · 额度文案变更 ${rewritten.length}` +
      `${added.length ? `（+${added.join("、")}）` : ""}${gone.length ? `（-${gone.join("、")}）` : ""}` +
      `${rewritten.length ? `（~${rewritten.join("、")}）` : ""}`;
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs + ".tmp", files[rel]); // 先临时名再原子替换：抓取中断不会留半截 JSON 污染下轮 diff
  renameSync(abs + ".tmp", abs);
  console.log(`igetoken /models 完成：${doc.platformCount}/${doc.declaredCount} 家 · ${delta} · 指纹 ${doc.sourceFingerprint}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

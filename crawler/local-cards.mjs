/** 本地增补卡：本站一手核验、上游却没收录的情报（设计 spec §6）。
 *  为什么必须有这一层：data/tokens.json 每 6 小时被上游全量覆写（crawl.yml 的 cron +
 *  adapt.mjs:adaptItems 只遍历上游 items），手工往库里加一张卡既不报红也不留痕，
 *  只会在下一个 6 小时静默蒸发（spec §2.1–§2.3）。本地卡必须是管线的一等来源，不是库外私货。
 *  本文件是纯函数层：不 open 文件、不联网；读盘由 scripts/export-seed.mjs:loadLocal 与
 *  crawler/run.mjs 的 prev 各负责一处，把文本交给 loadLocalCards。 */
import { createHash } from "node:crypto";
import { FACT_FIELDS } from "./adapt.mjs";

/** 分类三档：与 src/lib/admin/config.ts 的 TYPE_VALUES 同集（跨语言两份实现由用例 ⑦ 逐字对账）。
 *  catOf（src/lib/catalog.ts:6-10）对未知 type 一律兜成「大模型」，不挡就会把工具卡排进模型栏。 */
export const LOCAL_TYPE_VALUES = ["大模型", "工具", "项目"];

/** 观点键：上游已无载体（决策 Q1），本地卡的手写点评只能从这张白名单过；
 *  名单外的键＝未知字段当场抛，绝不静默丢——丢字段等于丢读者的决策依据。 */
const VIEW_KEYS = ["rating", "signup", "effect", "pin", "alwaysShow", "badge", "tone", "extraAction", "v2"];
/** 出处三键：origin 恒为 local；sourceUrl 是「额度值出在哪个页面」；checkedAt 是本站核验日。 */
const PROVENANCE_KEYS = ["origin", "sourceUrl", "checkedAt"];
const ALLOWED_KEYS = [...FACT_FIELDS, ...VIEW_KEYS, ...PROVENANCE_KEYS];
const REQUIRED_KEYS = ["name", "type", "updated", "link"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\//i;

/** 归一化卡类型：事实 7 键齐全＋出处 3 键钉尾，观点键走索引签名。
 *  必须显式 typedef：本 .mjs 无 .d.mts，tsconfig 是 allowJs＋strict（不 checkJs），
 *  没有这条标注时 tsc 对测试只能看到点号赋值的 origin/sourceUrl/checkedAt 三键，
 *  用例 ⑨ 取 card.limited 会报 TS2339。 */
/** @typedef {Record<string, unknown> & { name: string; type: string; modality: string; quota: string; link: string; limited: string | null; updated: string; origin: string; sourceUrl: string; checkedAt: string }} LocalCard */

/** 单条本地卡 → 落盘形态：必填校验 + 固定键序（沿用 adapt.mjs:40 factPatch 的思路，
 *  事实 7 键在最前，观点键次之，出处键置尾），保证「同一份文本 → 同一串字节」。
 *  link / sourceUrl 的协议这一关必须在这里把：linkRisk（`clean.mjs:linkRisk`，声明在 :103）对空串与裸域名
 *  一律返回 null 即放行，指望下游等于没指望（spec 复核记 8）。
 *  @param {Record<string, unknown>} card @param {number} i @returns {LocalCard} */
export function normalizeLocalCard(card, i) {
  const named = card && typeof card === "object" && typeof card.name === "string" && card.name.trim();
  const label = `local-cards#${i}（${named ? card.name : "无名"}）`;
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    throw new Error(`${label}：不是对象（${card === null ? "null" : Array.isArray(card) ? "数组" : typeof card}）`);
  }
  for (const k of REQUIRED_KEYS) {
    if (typeof card[k] !== "string" || !card[k].trim()) throw new Error(`${label}：缺必填字段 ${k}`);
  }
  if (!HTTPS_RE.test(card.link)) throw new Error(`${label}：link 必须是 https:// 开头的完整地址`);
  const source = card.sourceUrl === undefined ? card.link : card.sourceUrl;
  if (!HTTPS_RE.test(source)) throw new Error(`${label}：sourceUrl 必须是 https:// 开头的完整地址`);
  if (!DATE_RE.test(card.updated)) throw new Error(`${label}：updated 必须是 YYYY-MM-DD（本地 UTC+8 核验日）`);
  if (card.checkedAt !== undefined && !DATE_RE.test(card.checkedAt)) {
    throw new Error(`${label}：checkedAt 必须是 YYYY-MM-DD`);
  }
  if (!LOCAL_TYPE_VALUES.includes(card.type)) {
    throw new Error(`${label}：type=${card.type} 不在三档口径 ${LOCAL_TYPE_VALUES.join("/")} 内`);
  }
  if (card.origin !== undefined && card.origin !== "local") {
    throw new Error(`${label}：origin 只认 "local"（本站手写来源），收到 ${JSON.stringify(card.origin)}`);
  }
  const unknown = Object.keys(card).filter((k) => !ALLOWED_KEYS.includes(k));
  if (unknown.length) {
    throw new Error(`${label}：未知字段 ${unknown.join(", ")}（hide/link/type 覆盖请写 config/site-config.json，码池与海报键不入本地卡）`);
  }

  const out = {};
  for (const k of FACT_FIELDS) {
    // 与 adaptItem 同源的缺省：limited 缺省 null，其余字符串键缺省空串（键必须齐，否则键序漂移）。
    // 但「缺省」只适用于**没写**这个键；写了却类型不对（quota: 200000 / modality: ["chat"] / limited: 123）
    // 一律抛——把它静默清成空串＝丢读者的决策依据，与本模块立身的「绝不静默丢」自相矛盾（Task 1 评审 R-3）。
    // 空串本身合法：那是归一化产物的缺省值，用例 ⑨ 的幂等（归一化结果再归一化）要求它必须过。
    const v = card[k];
    if (k === "limited") {
      if (v !== undefined && v !== null && typeof v !== "string") {
        throw new Error(`${label}：字段 limited 只能是字符串或 null，收到 ${JSON.stringify(v)}`);
      }
      out[k] = v ?? null;
      continue;
    }
    if (v !== undefined && typeof v !== "string") {
      throw new Error(`${label}：字段 ${k} 必须是字符串，收到 ${JSON.stringify(v)}`);
    }
    out[k] = typeof v === "string" ? v : "";
  }
  for (const k of VIEW_KEYS) {
    if (card[k] !== undefined) out[k] = card[k];
  }
  out.origin = "local";
  out.sourceUrl = source;
  out.checkedAt = card.checkedAt ?? card.updated;
  return out;
}

/** 上游卡数组 + 本地条目 → 合并结果。两条口径（spec §6.2 / 裁决 #8）：
 *  ① 同名一律**上游胜出**，本地条目跳过并回传 warn——上游接管了就别再挂本站出处；
 *  ② 上游没有的本地卡**追加尾部、取文件序不排序**：文件是人维护的唯一真源，
 *     字节稳定即幂等（seed:repro 的「产物喂回自己不变」正靠这一点）。
 *  归一化在这里逐条调用（D-1）：放在合并点而不是两个取数口，是为了让「忘记归一」这种写法无法出现。
 *  上游数组只读不改，返回新数组。 */
export function mergeLocalCards(upstreamCards, localCards) {
  const out = Array.isArray(upstreamCards) ? upstreamCards.slice() : [];
  const taken = new Set(out.map((c) => c && c.name));
  const warn = [];
  (Array.isArray(localCards) ? localCards : []).forEach((card, i) => {
    const n = normalizeLocalCard(card, i);
    if (taken.has(n.name)) {
      warn.push(n.name);
      return;
    }
    taken.add(n.name);
    out.push(n);
  });
  return { cards: out, warn };
}

/** 文本 → 原始条目数组。空文本 / 缺文件（上层传空串）→ []，不新增 fail-stop；
 *  但语法坏或顶层不是数组必须抛——这里出声的代价远小于让一张卡静默蒸发的代价。
 *  单条校验交给 normalizeLocalCard（由 mergeLocalCards 统一调用，见 D-1），本函数不碰内容。 */
export function loadLocalCards(text) {
  if (text === null || text === undefined || String(text).trim() === "") return [];
  const fp = createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`config/local-cards.json 解析失败（[sha256:${fp}]）：${e.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`config/local-cards.json 顶层必须是数组（[sha256:${fp}]），收到 ${parsed === null ? "null" : typeof parsed}`);
  }
  return parsed;
}

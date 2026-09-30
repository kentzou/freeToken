import type { CompiledRules } from "./rules";
import type { FilterState, FilterType, TokenCard, WatchItem } from "./types";

const MAX_RATING = 5;

export function catOf(card: Pick<TokenCard, "type">): "大模型" | "工具" | "项目" {
  if (card.type === "项目") return "项目";
  if (card.type === "工具") return "工具";
  return "大模型";
}

/** 精选门槛：name+modality 归一化后命中任一规则（镜像 isFeatured） */
export function isFeatured(card: TokenCard, rules: CompiledRules): boolean {
  const text = `${card.name} ${card.modality || ""}`.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
  return rules.featured.some((r) => r.re.test(text));
}

/** 观望剔除 → 门槛过滤 → pin 强制位次（镜像 VISIBLE_RAW + VISIBLE） */
export function visibleCards(cards: TokenCard[], donots: WatchItem[], rules: CompiledRules): TokenCard[] {
  const blocked = new Set(donots.map((d) => d.name));
  const out = cards
    .filter((c) => !blocked.has(c.name) && (c.alwaysShow || isFeatured(c, rules)))
    .slice();
  out
    .filter((c) => c.pin)
    .sort((a, b) => (a.pin || 0) - (b.pin || 0))
    .forEach((c) => {
      const i = out.indexOf(c);
      if (i > -1) {
        out.splice(i, 1);
        out.splice(Math.min((c.pin || 1) - 1, out.length), 0, c);
      }
    });
  return out;
}

export function splitByCategory(cards: TokenCard[]): { editorial: TokenCard[]; partners: TokenCard[] } {
  return {
    editorial: cards.filter((c) => catOf(c) !== "项目"),
    partners: cards.filter((c) => catOf(c) === "项目"),
  };
}

/** 关键词全文检索（name/modality/quota/effect），大小写不敏感 */
export function matchesFilter(card: TokenCard, filter: FilterState): boolean {
  const text = `${card.name} ${card.modality || ""} ${card.quota || ""} ${card.effect || ""}`.toLowerCase();
  const query = filter.query.trim().toLowerCase();
  if (query && !text.includes(query)) return false;
  if (filter.type === "大模型" || filter.type === "工具") return catOf(card) === filter.type;
  if (filter.type === "limited") return Boolean(card.limited);
  if (filter.type === "productivity") return /办公|工作台|agent|智能体|生产力|文档|ppt|excel/i.test(text);
  if (filter.type === "image") return /图像|生图|视觉|图片|多模态/i.test(text);
  if (filter.type === "audio") return /语音|音频|声音|step-audio/i.test(text);
  if (filter.type === "data") return /数据|分析|研究|报表|金融/i.test(text);
  if (filter.type === "platform") return /api|平台|开发者|openai|网关/i.test(text);
  return true;
}

const PRIORITY_MODELS = [/glm-5\.3/i, /stepfun|阶跃/i, /siliconflow|硅基/i];
const PRIORITY_TOOLS = [/workbuddy/i, /qoder|灵码/i, /kilo/i, /cline/i, /verdent/i];

/** 区块排序：先人工优先级表（未命中=999），同权重内按核验日期新→旧，再按名称升序。
 *  补两级 tie-break 的依据是审查 L3 + H2′：镜像里 sort 按钮声称「最新优先」而实按优先级表排，
 *  本站不做这个控件，但顺序必须可声明、可复现——只靠 Array.sort 稳定性等于把排序语义
 *  外包给 tokens.json 的书写顺序，上游一次重排就悄悄改变版面。 */
function rank(items: TokenCard[], patterns: RegExp[], kind: "大模型" | "工具", filter: FilterState): TokenCard[] {
  const pick = (c: TokenCard) => {
    const i = patterns.findIndex((re) => re.test(c.name));
    return i < 0 ? 999 : i;
  };
  return items
    .filter((c) => catOf(c) === kind && matchesFilter(c, filter))
    .sort((a, b) => pick(a) - pick(b) || (b.updated || "").localeCompare(a.updated || "") || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export function modelsFor(items: TokenCard[], filter: FilterState): TokenCard[] {
  return rank(items, PRIORITY_MODELS, "大模型", filter);
}

export function toolsFor(items: TokenCard[], filter: FilterState): TokenCard[] {
  return rank(items, PRIORITY_TOOLS, "工具", filter);
}

export function chipCounts(items: TokenCard[]): Record<FilterType, number> {
  const all: FilterState = { type: "all", query: "" };
  return {
    all: items.length,
    大模型: modelsFor(items, all).length,
    工具: toolsFor(items, all).length,
    limited: items.filter((c) => c.limited).length,
    productivity: items.filter((c) => matchesFilter(c, { type: "productivity", query: "" })).length,
    image: items.filter((c) => matchesFilter(c, { type: "image", query: "" })).length,
    audio: items.filter((c) => matchesFilter(c, { type: "audio", query: "" })).length,
    data: items.filter((c) => matchesFilter(c, { type: "data", query: "" })).length,
    platform: items.filter((c) => matchesFilter(c, { type: "platform", query: "" })).length,
  };
}

export function latestUpdated(items: TokenCard[]): string {
  return items.slice().sort((a, b) => b.updated.localeCompare(a.updated))[0]?.updated || "—";
}

/** ISO 周序号 = 报头「第 N 期」；全站唯一一份实现（种子脚本不再重复计算） */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // 周一=1 … 周日=7
  t.setUTCDate(t.getUTCDate() + 4 - day); // 归到本周四：含 1 月 4 日的那一週才是 ISO 第 1 周
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function dateLine(d: Date, issueNo: number): string {
  return `${isoDate(d)} 星期${WEEKDAYS[d.getUTCDay()]} · Token 情报局 · 第 ${issueNo} 期`;
}

/** 窄屏报头只留「月-日 · 第 N 期」；与 dateLine 共用同一个日期格式化，杜绝两处漂移 */
export function shortDateLine(d: Date, issueNo: number): string {
  return `${isoDate(d).slice(5)} · 第 ${issueNo} 期`;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function headline(count: number): string {
  return `免费 AI 额度，今日已核验 ${count} 条`;
}

export { MAX_RATING };

import type { CompiledRules } from "./rules";
import type { TokenCard } from "./types";

/** 破折号统一，避免宋体断字怪味（镜像 cleanText） */
export function cleanText(value: string): string {
  return String(value).replace(/[—–]/g, "-");
}

/** "2026-10-05" → "10/5"（镜像 fmtMd） */
export function fmtMd(date: string): string {
  const p = date.split("-");
  return `${Number.parseInt(p[1], 10)}/${Number.parseInt(p[2], 10)}`;
}

export function shortText(value: string | undefined, max = 92): string {
  const clean = cleanText(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/[，。；、\s]+$/g, "")}…`;
}

export function displayName(item: Pick<TokenCard, "name">): string {
  const name = cleanText(item.name);
  if (/qoder|灵码/i.test(name)) return "Qoder";
  if (/stepfun|阶跃/i.test(name)) return "StepFun";
  if (/siliconflow|硅基/i.test(name)) return "SiliconFlow";
  return name.replace(/（.*?）/g, "");
}

export function brandName(item: Pick<TokenCard, "name">): string {
  const name = cleanText(item.name);
  if (/glm|智谱/i.test(name)) return "智谱清言";
  if (/stepfun|阶跃/i.test(name)) return "阶跃星辰";
  if (/siliconflow|硅基/i.test(name)) return "硅基流动";
  return displayName(item);
}

/** logo：4 个官方特例优先，其次上游规则表，兜底 tencent.png（镜像 logoFor） */
export function logoFor(item: TokenCard, rules: CompiledRules): string {
  const name = item.name || "";
  if (/workbuddy/i.test(name)) return "assets/logos/workbuddy-official.png";
  if (/qoder|灵码/i.test(name)) return "assets/logos/qoder-ui.svg";
  if (/glm|智谱|z\.ai/i.test(name)) return "assets/logos/zhipu-ui.svg";
  if (/stepfun|阶跃/i.test(name)) return "assets/logos/stepfun-ui.svg";
  const details = `${item.modality || ""} ${item.effect || ""}`;
  const hit = rules.logo.find(([re]) => re.test(name)) || rules.logo.find(([re]) => re.test(details));
  return `assets/logos/${hit ? hit[1] : "tencent"}.png`;
}

export function freeLabel(card: TokenCard): string {
  if (card.limited) return `限时 ${fmtMd(card.limited)}`;
  if (/不限|长期|永久免费|真免费/i.test(`${card.quota || ""} ${card.effect || ""}`)) return "长期免费";
  return "免费额度";
}

/** 精选大卡标题：内嵌 <span> 高亮，改由 JSX 渲染，这里返回分段（前半/高亮） */
export function heroTitle(card: TokenCard, index: number): { lead: string; hl: string } {
  if (/workbuddy/i.test(card.name)) return { lead: "更强的 AI 工作空间，", hl: "从免费开始" };
  if (/qoder|灵码/i.test(card.name)) return { lead: "为真实开发而生的 ", hl: "AI 编程伙伴" };
  return index === 0 ? { lead: "高价值额度，", hl: "先领先用" } : { lead: "可靠模型，", hl: "免费开用" };
}

/** 卡片两行文案：命中规则表用人工润色文案，否则退回首段模型名（镜像 compactCardCopy） */
export function compactCardCopy(
  item: TokenCard,
  rules: CompiledRules
): { models: string; summary: string } {
  const hit = rules.cardCopy.find(([re]) => re.test(item.name));
  if (hit) return { models: hit[1], summary: hit[2] };
  const models = shortText(cleanText(item.modality || "AI 模型与工具").split("·")[0], 32);
  const summary = item.limited
    ? "限时免费开放，领取方式以平台规则为准。"
    : "注册可用免费额度，适合日常体验与开发。";
  return { models, summary };
}

/** FNV-1a 36 进制短码，保证同名稳定、详情页路径可复现（镜像 detailSlug） */
export function detailSlug(name: string, rules: CompiledRules): string {
  const match = rules.detailSlug.find(([re]) => re.test(name));
  if (match) return match[1];
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `item-${(hash >>> 0).toString(36)}`;
}

export function regionOf(name: string, rules: CompiledRules): string | null {
  return rules.regionByName[name] || null;
}

/** 静态导出无 localStorage/随机源：领取链接即清洗后的 link（码池已在清洗阶段置空） */
export function ctaHref(card: TokenCard): string {
  return card.link || "#";
}

/** 带推广特征的链接加 sponsored，向搜索引擎声明非自然链（镜像 cardLink 的正则） */
export function ctaRel(card: TokenCard): string {
  const referral = /invite|usercode|[?&]aff=|qcloud\.com|work-fission|s\.mi\.cn/i.test(card.link || "");
  return referral ? "sponsored nofollow noopener noreferrer" : "noopener noreferrer";
}

export function stars(rating: number = 0): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** 把数字片段切出来，交给 <Highlight>/<b class="num"> 渲染，替代镜像的 innerHTML 注入 */
export function splitNumbers(text: string): { text: string; num: boolean }[] {
  const out: { text: string; num: boolean }[] = [];
  const re = /(\d[.\d]*\s*(?:万|亿|千万|百万)?(?:\s*Tokens?|\s*次|\s*元|\s*积分|\s*RPM|\s*TPM)?)/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), num: false });
    out.push({ text: m[0], num: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), num: false });
  return out;
}

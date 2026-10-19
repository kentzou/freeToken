import { isOwnShortLink } from "../../crawler/clean.mjs";
import type { CompiledRules } from "./rules";
import type { TokenCard } from "./types";

/** 破折号统一，避免宋体断字怪味（镜像 cleanText） */
export function cleanText(value: string): string {
  return String(value).replace(/[—–]/g, "-");
}

/** "2026-10-05" → "10/5"（镜像 fmtMd）。
 *  与镜像的差别只在容错：旧写法 split("-") 取下标，遇缺日或整体缺失（"2026-10"、"长期有效"、
 *  latestUpdated 的 "—" 哨兵）会算出 "NaN/NaN"；而混进说明文字的实测值 limited=「2026-10-07（活动截止）」
 *  反而靠 parseInt 的前缀解析侥幸算对（→ 10/7）。当前三个调用点都只在 card.limited 非空时取值，
 *  入库 33 张卡的 limited 全为可解析形态，所以这条路径今天不可达（REVIEW_REPORT L4 原文「故未爆」）；
 *  本函数按 L4 的建议抽出安全 formatter 作防御——抽到 YYYY-M-D 才格式化，抽不到原样退回，绝不产出 NaN。 */
export function fmtMd(date: string): string {
  const raw = String(date ?? "");
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (!m) return raw;
  return `${Number.parseInt(m[2], 10)}/${Number.parseInt(m[3], 10)}`;
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

/** 官方品牌标：`[匹配卡名的正则, public/assets/logos/ 下的文件名]`，按序取第一个命中。
 *  入库门槛只有一条——文件必须是**从该卡自己的 link 域（或该域自家 CDN）取回的官方图**（2026-10-16 三轮抓取，
 *  取不到的品牌一律不进表、继续走中性兜底）。兜底绝不冒用他人品牌：2026-09-30 审查裁决 REVIEW_REPORT M2
 *  （旧实现兜底 tencent.png 让「字节 TRAE」显示腾讯标＝虚假信息）、2026-10-16 用户裁决「不能错乱使用图标」。
 *  正则一律**锚定卡名开头**（除前 4 条历史特例）：卡名里出现别家模型名是常态，
 *  例如「UOS AI（deepin）免费 DeepSeek 账号」，不锚就会把 DeepSeek 标披到 deepin 卡上。 */
export const OFFICIAL_LOGOS: readonly [RegExp, string][] = [
  [/workbuddy/i, "workbuddy-official.png"],
  [/qoder|灵码/i, "qoder-ui.svg"],
  [/glm|智谱|z\.ai/i, "zhipu-ui.svg"],
  [/stepfun|阶跃/i, "stepfun-ui.svg"],
  [/^库库\s*AI/, "baidu.png"],
  [/^商汤|sensenova/i, "sensenova.png"],
  [/^agnes\s*ai/i, "agnes-ai.svg"],
  [/^openrouter/i, "openrouter.png"],
  [/^bazaarlink/i, "bazaarlink.svg"],
  [/^天翼云/, "ctyun.ico"],
  [/^monkeycode/i, "monkeycode.png"],
  [/^点点\s*ai/i, "dots.svg"],
  [/^teleagent/i, "teleai.png"],
  [/^字节\s*trae/i, "trae.png"],
  [/^书生·端砚/, "openxlab.svg"],
  [/^华为云/, "huaweicloud.ico"],
  [/^联通云/, "cucloud.ico"],
  [/^uos\s*ai/i, "deepin.png"],
  [/^移动云/, "10086.ico"],
  [/^百川智能/, "baichuan-ai.ico"],
  [/^快手万擎/, "streamlake.ico"],
  [/^fastgpt/i, "fastgpt.ico"],
  [/^tokendance/i, "tokendance.svg"],
  [/^aicraft/i, "aicraft.svg"],
  [/^morph/i, "morphllm.ico"],
  [/^ofox/i, "ofox.ico"],
  [/^token\s*harbor/i, "tokenharbor.png"],
  [/^orcarouter/i, "orcarouter.ico"],
  [/^unorouter/i, "unorouter.png"],
  [/^novita/i, "novita.ico"],
  [/^fireworks/i, "fireworks.ico"],
  [/^apmix/i, "apmix.ico"],
  [/^deepseek/i, "deepseek.svg"],
  [/^讯飞星火/, "xfyun.ico"],
  [/^cohere/i, "cohere.ico"],
  [/^ovhcloud/i, "ovhcloud.ico"],
  [/^蚂蚁百灵/, "bailing.png"],
  [/^atomgit/i, "atomgit.ico"],
  [/^书生\s*intern/i, "internlm.png"],
  [/^mistral/i, "mistral.svg"],
  [/^xai/i, "xai.ico"],
];

export function logoFor(item: TokenCard, rules: CompiledRules): string {
  const name = item.name || "";
  const official = OFFICIAL_LOGOS.find(([re]) => re.test(name));
  if (official) return `assets/logos/${official[1]}`;
  /* 其次才轮到上游规则表（CI 拥有 data/rules.json，本地不可编辑）。
     只按**卡名**找品牌：modality/effect 写的是「这家免费额度含哪些模型」，拿它匹配规则表会让
     任何列了 GLM 的聚合平台披上智谱标（2026-10-16 实测 18 张卡因此错标，其中 10 张显示 zhipu.png）。
     注意 hit[1] 是**无扩展名的 slug**（实测 data/rules.json：`"slug": "kilo"`），所以命中分支自己补 `.png`；
     认不出品牌的兜底换成带扩展名的中性 generic.svg。 */
  const hit = rules.logo.find(([re]) => re.test(name));
  return hit ? `assets/logos/${hit[1]}.png` : "assets/logos/generic.svg";
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

/** 一枚外链对搜索引擎该挂什么 rel：带推广特征的加 sponsored，向搜索引擎声明非自然链。
 *  判据两处来源合一：正则镜像 cardLink，本站自有短链读 crawler/clean.mjs 的 OWN_SHORT_LINKS 同一份名单，
 *  这里不立第二份名单。ctaRel 与 SubAction 都只走这一处，副按钮不得自成一套。 */
export function linkRel(link: string): string {
  const referral = /invite|usercode|[?&]aff=|qcloud\.com|work-fission|s\.mi\.cn/i.test(link) || isOwnShortLink(link);
  return referral ? "sponsored nofollow noopener noreferrer" : "noopener noreferrer";
}

/** 主按钮（领取链接）的 rel ＝ 该卡 link 走 linkRel */
export function ctaRel(card: TokenCard): string {
  return linkRel(card.link || "");
}

export function stars(rating: number = 0): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

/** 镜像 app.js:577 seg() 的同位移植，行为与镜像逐字符一致（copy.test 钉死）。
 *  dormant：镜像自身无消费点、原型零引用（grep '"num"' 原型 = 0），本站不接 UI；
 *  将来若给额度数字加高亮，唯一实现就是它 + 荧光笔令牌，禁止再写第二条数字正则。 */
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

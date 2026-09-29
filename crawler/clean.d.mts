/**
 * crawler/clean.mjs 的类型声明（仅供 tsc 与测试消费，不改变运行时行为）。
 * 与 Task 3 的 extract.d.mts 同一模式：moduleResolution "bundler" 下，
 * 测试里的 "../crawler/clean.mjs" 按扩展名替换解析到本文件。
 * 卡片/观望条目字段原样透传（镜像源码字段繁多且陆续新增：name/link/poster/
 * inviteBase/inviteCodes/inviteParam/traeLinks/extraAction/type/why…），
 * 与 Task 3 的 TOKENS: any[] 同策略，用索引签名放行、不做逐属性约束。
 */
export interface TokenCardLike {
  [key: string]: any;
}

/** 观望条目与情报卡同构（applySiteConfig 按 name 命中两边） */
export type WatchLike = TokenCardLike;

/** config/site-config.json 的逐卡覆盖表；hide 只对情报卡生效 */
export interface SiteConfigCardPatch {
  link?: string;
  inviteBase?: string;
  inviteCodes?: string[];
  inviteParam?: string;
  traeLinks?: string[];
  hide?: boolean;
  [key: string]: any;
}
export interface SiteConfigLike {
  cards?: Record<string, SiteConfigCardPatch> | null;
}

/** 推广短链域名列表（linkRisk 的路径型推广判定依据） */
export const SHORT_LINK_HOSTS: string[];

/** 剥掉 search 与 hash 内的推广/追踪参数；无参数可洗时逐字节原样返回；解析失败返回原值 */
export function stripPromoParams(url: string): string;

/**
 * 清洗后残余风险判定：残留引流参数（search 与 hash 两处）/ SHORT_LINK_HOSTS 短链域名。
 * 运行时对非字符串（如缺 link 字段的观望条目）安全返回 null，故签名放宽为可选。
 */
export function linkRisk(url: string | null | undefined): string | null;

/** 单卡清洗（新对象，不改入参）：剥参 + 上游码池/原作者海报置空 */
export function cleanCard(card: TokenCardLike): TokenCardLike;

/** 本站 site-config 逐卡覆盖，语义与镜像 site-config.js 一致；无配置时原样返回新数组 */
export function applySiteConfig(
  cards: TokenCardLike[],
  donots: WatchLike[],
  cfg: SiteConfigLike | null
): { cards: TokenCardLike[]; donots: WatchLike[] };

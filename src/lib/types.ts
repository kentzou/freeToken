/** 情报卡：字段并集取自上游真实数据（spec §6 schema 的扩展，多 signup/badge/tone/extraAction/v2） */
export interface TokenCard {
  name: string;
  type: string; // 大模型 | 工具 | 项目
  modality?: string;
  rating?: number;
  quota?: string;
  signup?: string;
  effect?: string;
  link?: string;
  limited?: string | null;
  updated: string;
  pin?: number;
  alwaysShow?: boolean;
  badge?: string;
  tone?: string;
  extraAction?: { text: string; link: string };
  poster?: string;
  inviteBase?: string;
  inviteCodes?: string[];
  inviteParam?: string;
  traeLinks?: string[];
  v2?: boolean;
}

export interface WatchItem {
  name: string;
  why: string;
  link: string;
}

/** rules.json 存 RegExp 的 source 与 flags，构建期还原（缺 flags 会让 /i 规则变大小写敏感） */
export interface RuleBase {
  source: string;
  flags: string;
}
export interface RulesJson {
  featured: (RuleBase & { label: string })[];
  logo: (RuleBase & { slug: string })[];
  cardCopy: (RuleBase & { models: string; summary: string })[];
  detailSlug: (RuleBase & { slug: string })[];
  regionByName: Record<string, string>;
}

export interface CardOverrides {
  /** 分类覆盖（计划 5 D2）：只认 大模型/工具/项目，首页「合作情报」由它派生 */
  type?: string;
  link?: string;
  inviteBase?: string;
  inviteCodes?: string[];
  inviteParam?: string;
  traeLinks?: string[];
  hide?: boolean;
}

export interface SiteConfig {
  wechatId?: string;
  partners?: unknown[] | null;
  adminLogins?: string[];
  oauthClientId?: string;
  /** 后台的 Contents 读写目标仓（形如 owner/repo）。空串＝未配置，此时后台只读不写。
   *  注意它不会被 applySiteConfig 消费（该函数只看 cfg.cards），加这个键不影响管线。 */
  githubRepo?: string;
  cards?: Record<string, CardOverrides>;
}

export interface MetaJson {
  lastSyncedSha: string | null;
  lastSyncedAt: string;
  sourceFingerprint?: string;
  counts: { tokens: number; donots: number };
}

export type FilterType = "all" | "大模型" | "工具" | "limited" | "productivity" | "image" | "audio" | "data" | "platform";
export interface FilterState {
  type: FilterType;
  query: string;
}

/** OpenRouter 免费模型台账（data/openrouter.json，由 crawler/openrouter.mjs 产出；
 *  字段形态与 crawler/openrouter.d.mts 的 OpenRouterDoc 保持同步，页面消费侧只声明用到的最小集） */
export interface OpenRouterLedgerQuotaPolicy {
  source: string;
  scope: "account";
  perModelAllocation: null;
  appliesTo: string;
  requestsPerMinute: number;
  creditsThreshold: number;
  requestsPerDay: { lessThanCreditsThreshold: number; atLeastCreditsThreshold: number };
  reset: string;
  note: string;
  /** 恒为 false：/api/v1/models 不返回额度数值，这些数是代码常量，需人工核对 */
  scraped: boolean;
  verifiedAt: string;
}

export interface OpenRouterLedgerModel {
  id: string;
  name: string;
  /** 模型 id 以 :free 结尾（免费变体标记） */
  freeVariant: boolean;
  /** prompt/completion 单价均为 0（另一条免费判据，两者满足其一即入选台账） */
  tokenPriceZero: boolean;
  quotaRef: "quotaPolicy";
  contextLength: number | null;
  maxCompletionTokens: number | null;
  modality: string | null;
  moderated: boolean | null;
}

export interface OpenRouterLedger {
  source: string;
  fetchedAt: string;
  totalModels: number;
  freeModelCount: number;
  quotaPolicy: OpenRouterLedgerQuotaPolicy;
  models: OpenRouterLedgerModel[];
  sourceFingerprint?: string;
  accountQuota?: { used: number | null; limit: number | null; remaining: number | null };
  accountQuotaError?: string;
}

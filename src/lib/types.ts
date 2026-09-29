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

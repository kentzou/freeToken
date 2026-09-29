/**
 * crawler/extract.mjs 的类型声明（仅供 tsc 与测试消费，不改变运行时行为）。
 * Extracted 形状见 .superpowers/sdd/p1-task-3-brief.md；
 * TOKENS/DONOTS 取 any[]：卡片字段原值透传（如 link 未清洗），逐属性直读。
 */
export interface FeaturedRule {
  label: string;
  source: string;
  flags: string;
}
export interface LogoRule {
  source: string;
  flags: string;
  slug: string;
}
export interface CardCopyRule {
  source: string;
  flags: string;
  models: string;
  summary: string;
}
export interface DetailSlugRule {
  source: string;
  flags: string;
  slug: string;
}
export interface Extracted {
  TOKENS: any[];
  DONOTS: any[];
  FEATURED_RULES: FeaturedRule[];
  LOGO_RULES: LogoRule[];
  CARD_COPY_RULES: CardCopyRule[];
  DETAIL_SLUG_RULES: DetailSlugRule[];
  REGION_BY_NAME: Record<string, string>;
}

export const MERGE_BEGIN: string;
export const MERGE_END: string;

/** 扣除本站注入的 site-config 合并块，得到逐字节等价上游的源码 */
export function stripMergeBlock(src: string): string;

/** 括号扫描 + vm 沙箱提取七项结构 */
export function extractStructures(src: string): Extracted;

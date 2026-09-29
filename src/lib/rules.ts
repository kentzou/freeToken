import type { RulesJson } from "./types";

export interface CompiledRules {
  featured: { label: string; re: RegExp }[];
  logo: [RegExp, string][];
  cardCopy: [RegExp, string, string][];
  detailSlug: [RegExp, string][];
  regionByName: Record<string, string>;
}

/** 只还原已知结构；非法正则直接抛错，宁可构建失败也不带病上线 */
export function compiledRules(json: RulesJson): CompiledRules {
  const toRe = (source: string, flags?: string) => {
    try {
      return new RegExp(source, flags);
    } catch (e) {
      throw new Error(`规则正则还原失败：${source}（${(e as Error).message}）`);
    }
  };
  return {
    featured: json.featured.map((r) => ({ label: r.label, re: toRe(r.source, r.flags) })),
    logo: json.logo.map((r) => [toRe(r.source, r.flags), r.slug] as [RegExp, string]),
    cardCopy: json.cardCopy.map((r) => [toRe(r.source, r.flags), r.models, r.summary] as [RegExp, string, string]),
    detailSlug: json.detailSlug.map((r) => [toRe(r.source, r.flags), r.slug] as [RegExp, string]),
    regionByName: json.regionByName || {},
  };
}

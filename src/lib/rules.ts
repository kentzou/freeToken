import type { RuleBase, RulesJson } from "./types";

export interface CompiledRules {
  featured: { label: string; re: RegExp }[];
  logo: [RegExp, string][];
  cardCopy: [RegExp, string, string][];
  detailSlug: [RegExp, string][];
  regionByName: Record<string, string>;
}

/** 只还原已知结构；非法正则直接抛错，宁可构建失败也不带病上线。
 *  错误必须带「表名#序号(键名)」（终审遗留 #4：只报 source 无法定位是哪条规则） */
export function compiledRules(json: RulesJson): CompiledRules {
  const need = <T>(v: T[] | undefined, where: string): T[] => {
    if (!Array.isArray(v)) throw new Error(`规则结构异常：${where} 缺失或不是数组`);
    return v;
  };
  const toRe = (r: RuleBase, where: string): RegExp => {
    try {
      return new RegExp(r.source, r.flags);
    } catch (e) {
      throw new Error(`规则正则还原失败：${where}（source=${r.source} flags=${r.flags}）：${(e as Error).message}`);
    }
  };
  return {
    featured: need(json.featured, "featured").map((r, i) => ({
      label: r.label,
      re: toRe(r, `featured#${i}(${r.label})`),
    })),
    logo: need(json.logo, "logo").map((r, i) => [toRe(r, `logo#${i}(${r.slug})`), r.slug] as [RegExp, string]),
    cardCopy: need(json.cardCopy, "cardCopy").map(
      (r, i) => [toRe(r, `cardCopy#${i}(${r.models.slice(0, 16)})`), r.models, r.summary] as [RegExp, string, string]
    ),
    detailSlug: need(json.detailSlug, "detailSlug").map(
      (r, i) => [toRe(r, `detailSlug#${i}(${r.slug})`), r.slug] as [RegExp, string]
    ),
    regionByName: json.regionByName || {},
  };
}

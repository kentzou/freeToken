/** 括号扫描 + node:vm 沙箱：从上游 app.js 源码提取数据结构（不执行整文件） */
import { types } from "node:util";
import vm from "node:vm";

export const MERGE_BEGIN = "/* == SITE-CONFIG-MERGE BEGIN == */";
export const MERGE_END = "/* == SITE-CONFIG-MERGE END == */";

/** 扣除本站注入的 site-config 合并块，得到逐字节等价上游的源码 */
export function stripMergeBlock(src) {
  const b = src.indexOf(MERGE_BEGIN);
  if (b < 0) return src;
  const e = src.indexOf(MERGE_END);
  if (e < 0) throw new Error("找到 BEGIN 但缺 END，拒绝提取");
  return src.slice(0, b) + src.slice(e + MERGE_END.length + 1);
}

/** 从 `const NAME = [ … ]` / `{ … }` 定位并返回源码片段（含首尾括号） */
function findLiteral(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[\\[{]`).exec(src);
  if (!m) throw new Error(`提取失败：未找到 ${name}`);
  const start = src.indexOf(m[0], m.index) + m[0].length - 1;
  const open = src[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = null;
  let inLine = false;
  let inBlock = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") { inLine = true; i++; continue; }
    if (c === "/" && n === "*") { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`提取失败：${name} 括号未闭合`);
}

/** 在只读沙箱里求值一段字面量；只允许给定前置定义，拒绝任何全局访问 */
function evaluate片段(literal, prelude) {
  const code = `${prelude}\n(${literal})`;
  const ctx = vm.createContext(Object.create(null));
  return vm.runInContext(code, ctx, { timeout: 2000, filename: "extract.vm" });
}

/**
 * 三张「[RegExp, …]」规则表在 JSON 里的字段名（顺序即元组里 RegExp 之后的元素顺序）
 * 实测镜像：LOGO 32 项全 2 元、CARD_COPY 19 项全 3 元、DETAIL_SLUG 21 项全 2 元，其余元素均为 string。
 */
const PAIR_FIELDS = {
  logo: ["slug"],
  cardCopy: ["models", "summary"],
  detailSlug: ["slug"],
};

/**
 * 规则表 → JSON 可存结构。**flags 必须与 source 一起出参**：
 * 实测三张 pair 表 72/72 条正则全部带 `i`，只存 source 会在还原时悄悄变成大小写敏感，
 * 导致 logo 命中失败回落默认图、detailSlug 大面积落到 `item-<hash>` 兜底。
 */
function serializeRules(arr, kind) {
  if (!Array.isArray(arr)) throw new Error(`结构异常：${kind} 不是数组`);
  if (kind === "featured") {
    return arr.map((item) => {
      if (!types.isRegExp(item.re)) throw new Error(`结构异常：FEATURED_RULES 项缺 re`);
      return { label: String(item.label), source: item.re.source, flags: item.re.flags };
    });
  }
  const fields = PAIR_FIELDS[kind];
  if (!fields) throw new Error(`结构异常：未知规则表类型 ${kind}`);
  return arr.map((item) => {
    if (!Array.isArray(item) || !types.isRegExp(item[0])) {
      throw new Error(`结构异常：${kind} 项应为 [RegExp, …]`);
    }
    if (item.length !== fields.length + 1) {
      throw new Error(`结构异常：${kind} 项应为 ${fields.length + 1} 元组，实得 ${item.length} 元`);
    }
    const out = { source: item[0].source, flags: item[0].flags };
    fields.forEach((f, i) => (out[f] = String(item[i + 1])));
    return out;
  });
}

export function extractStructures(src) {
  const base = stripMergeBlock(src);
  const arrPrelude = ""; // 数组字面量自足，无需前置定义
  const TOKENS = evaluate片段(findLiteral(base, "TOKENS"), arrPrelude);
  const DONOTS = evaluate片段(findLiteral(base, "DONOTS"), arrPrelude);
  const FEATURED_RULES = serializeRules(
    evaluate片段(findLiteral(base, "FEATURED_RULES"), arrPrelude),
    "featured"
  );
  const LOGO_RULES = serializeRules(
    evaluate片段(findLiteral(base, "LOGO_RULES"), arrPrelude),
    "logo"
  );
  const CARD_COPY_RULES = serializeRules(
    evaluate片段(findLiteral(base, "CARD_COPY_RULES"), arrPrelude),
    "cardCopy"
  );
  const DETAIL_SLUG_RULES = serializeRules(
    evaluate片段(findLiteral(base, "DETAIL_SLUG_RULES"), arrPrelude),
    "detailSlug"
  );
  const REGION_BY_NAME = evaluate片段(findLiteral(base, "REGION_BY_NAME"), arrPrelude);
  if (!Array.isArray(TOKENS) || !TOKENS.length) throw new Error("提取失败：TOKENS 为空");
  if (!Array.isArray(DONOTS) || !DONOTS.length) throw new Error("提取失败：DONOTS 为空");
  if (!REGION_BY_NAME || typeof REGION_BY_NAME !== "object") throw new Error("提取失败：REGION_BY_NAME 结构异常");
  return { TOKENS, DONOTS, FEATURED_RULES, LOGO_RULES, CARD_COPY_RULES, DETAIL_SLUG_RULES, REGION_BY_NAME };
}

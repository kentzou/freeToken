/** 轻量 HTML 解析原语（零依赖）。
 *  只做「取标签块 / 取属性 / 取文本」三件事，够 adapter 用即可，
 *  不引入 cheerio/jsdom（避免为局部需求给全站加依赖）。 */

/** 解码常见 HTML 实体 + 去多余空白。 */
export function decodeEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** 清洗文本：解实体 → 去标签残留 → 折叠空白。 */
export function cleanText(s) {
  return decodeEntities(String(s || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** 取某属性值（支持单双引号）。 */
export function attr(tagHtml, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = tagHtml.match(re);
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : "";
}

/** 返回所有匹配 <tag ...>...</tag> 的完整块（非贪婪，不嵌套处理）。
 *  adapter 用来切分卡片：列表页结构平坦，够用。 */
export function blocks(html, tag, classNameRe) {
  const out = [];
  const openRe = new RegExp(`<${tag}\\b[^>]*class\\s*=\\s*["'][^"']*${classNameRe}[^"']*["'][^>]*>`, "gi");
  let m;
  while ((m = openRe.exec(html))) {
    const start = m.index;
    const endTag = `</${tag}>`;
    // 从开标签后开始找配对的闭标签（按同名标签计数处理简易嵌套）
    let depth = 1;
    let i = start + m[0].length;
    const tagRe = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
    tagRe.lastIndex = i;
    let t;
    while ((t = tagRe.exec(html)) && depth > 0) {
      if (t[0].startsWith(`</`)) {
        depth--;
        if (depth === 0) {
          i = t.index;
          break;
        }
      } else {
        depth++;
      }
    }
    out.push(html.slice(start, i + endTag.length));
    openRe.lastIndex = i + endTag.length;
  }
  return out;
}

/** 取最后一个匹配 <a ...> 开标签（用于卡片主链接）。 */
export function firstTag(html, tag, classRe) {
  const re = new RegExp(`<${tag}\\b[^>]*class\\s*=\\s*["'][^"']*${classRe}[^"']*["'][^>]*>`, "i");
  const m = html.match(re);
  return m ? m[0] : "";
}

/** 批量提取所有 <a> 标签（含闭合前内容），返回 {tag, href, text, html}。 */
export function anchors(html, filter) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const href = attr(`<a ${m[1]}>`, "href");
    if (filter && !filter({ href, text: cleanText(m[2]), html: m[2] })) continue;
    out.push({ tag, href, text: cleanText(m[2]), html: m[2] });
  }
  return out;
}

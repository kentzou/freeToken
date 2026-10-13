/** OneNav 主题通用解析器（ai-bot.cn / aigc.cn 等站共用）。
 *  为什么抽出来：实测 ai-bot.cn 与 aigc.cn 使用同一套 OneNav 主题，
 *  卡片 DOM 结构逐字相同（url-card > a[href][data-url][title] > img[data-src] + strong + p）。
 *  两个 adapter 各写一份解析 = 重复实现，故收敛到此处，adapter 只提供站点差异（域名/分类清单）。
 *
 *  实测结构（2026-10-10）：
 *    <div class="url-card ...">
 *      <a href="/sites/<id>.html" data-url="<外链>" title="<详细描述>">
 *        <img data-src="<logo>">
 *        <div class="url-info"><div><strong>名称</strong></div>
 *          <p class="... text-muted ...">简介</p></div> */
import { blocks, attr, cleanText } from "./parse.mjs";

/** 从 OneNav 卡片 HTML 抽一条原始记录；无名称返回 null。
 *  @param origin 站点根域名（用于详情页相对路径绝对化）
 *  @param rawCategory 该卡片所属分类名（由抓取页上下文注入） */
export function parseOneNavCard(cardHtml, { origin, rawCategory = "", siteId, fetchedAt }) {
  const aMatch = cardHtml.match(/<a\b[^>]*>/i);
  if (!aMatch) return null;
  const aTag = aMatch[0];
  const detailUrl = attr(aTag, "href");
  const externalUrl = attr(aTag, "data-url");
  const titleAttr = attr(aTag, "title");

  const nameM = cardHtml.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i);
  const rawName = cleanText(nameM ? nameM[1] : "");
  if (!rawName) return null;

  const pM = cardHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const rawDesc = cleanText(pM ? pM[1] : "") || titleAttr;

  const imgM = cardHtml.match(/<img\b[^>]*>/i);
  const logo = imgM ? attr(imgM[0], "data-src") || attr(imgM[0], "src") : "";

  const absDetail = detailUrl.startsWith("http") ? detailUrl : `${origin}${detailUrl}`;

  return {
    rawName,
    rawDesc,
    detailUrl: absDetail,
    externalUrl: externalUrl || "",
    logo: logo || "",
    rawCategory,
    siteId,
    fetchedAt,
  };
}

/** 抓一个 OneNav 分类页，返回去重后的工具数组。 */
export function parseOneNavPage(html, { origin, rawCategory, siteId, fetchedAt }) {
  const cards = blocks(html, "div", "url-card");
  const out = [];
  for (const c of cards) {
    const rec = parseOneNavCard(c, { origin, rawCategory, siteId, fetchedAt });
    if (rec) out.push(rec);
  }
  return out;
}

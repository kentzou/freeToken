/** ai-bot.cn（AI工具集）adapter。
 *  站点特性：OneNav 主题；首页卡片不带分类，故按**分类页**抓取（每页 h1 即分类名）。
 *  解析逻辑复用 lib/onenav.mjs（与 aigc.cn 同主题），本文件只提供站点差异部分。 */
import { grabText } from "../lib/http.mjs";
import { parseOneNavPage } from "../lib/onenav.mjs";

export const id = "aibot";
export const name = "AI工具集";

const ORIGIN = "https://ai-bot.cn";

/** 一级分类（实测自站内导航，15 个）。slug 用于路径，name 为中文分类名。 */
export const CATEGORY_PATHS = [
  ["ai-writing-tools", "AI写作工具"],
  ["ai-image-tools", "AI图像工具"],
  ["ai-video-tools", "AI视频工具"],
  ["ai-office-tools", "AI办公工具"],
  ["ai-agent", "AI智能体"],
  ["ai-chatbots", "AI聊天助手"],
  ["ai-programming-tools", "AI编程工具"],
  ["ai-design-tools", "AI设计工具"],
  ["ai-audio-tools", "AI音频工具"],
  ["ai-search-engines", "AI搜索引擎"],
  ["ai-frameworks", "AI开发平台"],
  ["websites-to-learn-ai", "AI学习网站"],
  ["ai-models", "AI训练模型"],
  ["ai-content-detection-and-optimization-tools", "AI内容检测"],
  ["ai-prompt-tools", "AI提示指令"],
];

/** 遍历分类页抓取，按 detailUrl 全局去重（同工具多分类只留首次）。 */
export async function fetchList(site, fetchedAt = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  for (const [slug, catName] of CATEGORY_PATHS) {
    const r = await grabText(`${ORIGIN}/favorites/${slug}/`);
    if (!r.ok) return { tools: out, ok: false, error: `分类 ${slug}: ${r.error}` };
    const tools = parseOneNavPage(r.text, { origin: ORIGIN, rawCategory: catName, siteId: id, fetchedAt });
    for (const t of tools) {
      if (!seen.has(t.detailUrl)) {
        seen.add(t.detailUrl);
        out.push(t);
      }
    }
  }
  return { tools: out, ok: true, error: "" };
}

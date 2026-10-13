/** aigc.cn（AIGC导航）adapter。
 *  站点特性：OneNav 主题（与 ai-bot.cn 同款，卡片结构一致，解析复用 lib/onenav.mjs）；
 *  按分类页抓取，分类名取自配置表（不依赖页面 title 格式，更稳）。
 *  该站另有 /submit 收录页 —— 本站来源页的「申请收录」入口即借鉴自此。 */
import { grabText } from "../lib/http.mjs";
import { parseOneNavPage } from "../lib/onenav.mjs";

export const id = "aigc";
export const name = "AIGC导航";

const ORIGIN = "https://www.aigc.cn";

/** 一级分类（实测自首页 /favorites/ 链接，并逐个验证可达 + 卡片数）。
 *  已剔除：ai-resume-maker（404）、ai-api（连接失败）。 */
export const CATEGORY_PATHS = [
  ["ai-writing-tools", "AI写作"],
  ["ai-video-generation", "AI视频"],
  ["ai-office", "AI办公"],
  ["ai-design-tools", "AI设计"],
  ["ai-programming-tools", "AI编程"],
  ["ai-digital-human", "AI数字人"],
  ["text-to-speech", "AI语音"],
  ["ai-music-generation", "AI音乐"],
  ["ai-paper", "AI论文"],
  ["ai-comic-drama", "AI漫剧"],
  ["aigc-check", "AIGC检测"],
  ["ai-prompt-keywords", "AI提示词"],
  ["ai-writing-novel", "AI小说"],
  ["ai-courses", "AI课程"],
  ["desktop-ai-assistant", "桌面助理"],
  ["new-ai-tools", "新收录"],
];

/** 遍历分类页抓取，按 detailUrl 全局去重。 */
export async function fetchList(site, fetchedAt = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  for (const [slug, catName] of CATEGORY_PATHS) {
    const r = await grabText(`${ORIGIN}/favorites/${slug}`);
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

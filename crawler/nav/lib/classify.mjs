/** 原始分类 → 本站统一一级分类 的唯一映射出口。
 *  为什么单独成文件：分类映射是唯一会随上游变动而腐化的逻辑，
 *  集中一处便于审计与迭代；adapter 只记录原样 rawCategory，绝不自己归类。
 *
 *  两级策略（实测后修正）：
 *    1) 上游原始分类名精确映射（rawCategory 是最可靠信号，覆盖 33 种取值）
 *    2) 原始分类判不出时，才退回关键词匹配描述文本
 *  早期只做关键词匹配，导致「Pika(视频)」「iSlide(办公)」因描述含"代码"被误归编程；
 *  改用「原始分类优先」后此类误判消除。 */

/** 本站统一一级分类（14 个）。键 = slug，值 = 中文名。顺序即展示顺序。 */
export const CATEGORIES = {
  chat: "AI 对话助手",
  writing: "AI 写作",
  image: "AI 图像",
  video: "AI 视频",
  audio: "AI 音频",
  code: "AI 编程",
  agent: "AI 智能体",
  office: "AI 办公效率",
  design: "AI 设计",
  search: "搜索与检索",
  model: "模型与开发平台",
  learning: "AI 学习与资源",
  detect: "AI 检测与优化",
  prompt: "AI 提示词",
};

/** 上游原始分类名 → 本站分类 slug（精确匹配，优先级最高）。
 *  键涵盖实测到的 33 种上游分类值（ai-bot.cn 15 种 + aigc.cn 16 种 + 中文别名）。 */
const RAW_CATEGORY_MAP = {
  // 对话
  "AI聊天助手": "chat",
  "AI对话": "chat",
  "AI助理": "chat",
  "桌面助理": "chat",
  // 写作
  "AI写作工具": "writing",
  "AI写作": "writing",
  "AI小说": "writing",
  "AI论文": "writing",
  "AI简历": "writing",
  // 图像
  "AI图像工具": "image",
  "AI图像": "image",
  "AI绘画": "image",
  "AI绘图": "image",
  // 视频
  "AI视频工具": "video",
  "AI视频": "video",
  "AI数字人": "video",
  "AI漫剧": "video",
  // 音频
  "AI音频工具": "audio",
  "AI音频": "audio",
  "AI语音": "audio",
  "AI音乐": "audio",
  // 编程
  "AI编程工具": "code",
  "AI编程": "code",
  // 智能体
  "AI智能体": "agent",
  // 办公
  "AI办公工具": "office",
  "AI办公": "office",
  // 设计
  "AI设计工具": "design",
  "AI设计": "design",
  // 搜索
  "AI搜索引擎": "search",
  // 模型/开发平台
  "AI开发平台": "model",
  "AI训练模型": "model",
  "AI模型": "model",
  // 学习
  "AI学习网站": "learning",
  "AI课程": "learning",
  "AI学习": "learning",
  // 检测与优化
  "AI内容检测": "detect",
  "AIGC检测": "detect",
  "AI检测": "detect",
  // 提示词
  "AI提示指令": "prompt",
  "AI提示词": "prompt",
  "AI提示": "prompt",
};

/** 关键词 → 分类 slug（rawCategory 判不出时的兜底）。按序首个命中即返回。 */
const KEYWORD_RULES = [
  ["提示词|Prompt|指令库|咒语", "prompt"],
  ["检测|降AI|降AIGC|降重|查重|去AI味|内容审核|校对|纠错|Detector|Detection", "detect"],
  ["编程|代码|开发工具|IDE|程序员|低代码|Coding|Code", "code"],
  ["视频|影片|剪辑|动画|Video|短视频|数字人|口播", "video"],
  ["音频|语音|音乐|配音|播客|Audio|Voice|Music|TTS|ASR", "audio"],
  ["图像|图片|绘画|画图|插画|抠图|海报|Image|Photo|绘图|3D|渲染", "image"],
  ["写作|文案|文本|翻译|润色|改写|小说|论文|简历|Writing|Text|Copy|SEO", "writing"],
  ["办公|效率|文档|表格|PPT|幻灯片|演示|会议|笔记|邮件|日程|Office|Excel|Word", "office"],
  ["智能体|Agent|自动化|工作流|机器人|Bot", "agent"],
  ["设计|UI|UX|平面|电商设计|Logo|Design", "design"],
  ["搜索|检索|知识库|问答|爬取|Search|RAG", "search"],
  ["模型|训练|微调|推理|部署|开发平台|API|算力|框架|Model|LLM|MLOps", "model"],
  ["学习|教程|课程|教育|科研|学术|知识|Learning|Edu|资源", "learning"],
  ["对话|聊天|助理|助手|客服|Chat|Chatbot|GPT", "chat"],
];

/** 原始分类名 + 描述 → 分类 slug。
 *  优先匹配 rawCategories（数组，任一命中即采纳），全不中再退回描述关键词。 */
export function classify(rawCategories, desc = "") {
  const cats = Array.isArray(rawCategories) ? rawCategories : rawCategories ? [rawCategories] : [];
  // 第一级：原始分类精确映射
  for (const c of cats) {
    const key = String(c || "").trim();
    if (Object.hasOwn(RAW_CATEGORY_MAP, key)) {
      // "新收录" 是跨分类聚合页，不具分类含义，跳过
      if (key === "新收录") continue;
      return RAW_CATEGORY_MAP[key];
    }
  }
  // 第二级：描述关键词兜底
  const hay = `${cats.join(" ")} ${desc}`;
  for (const [re, slug] of KEYWORD_RULES) {
    if (new RegExp(re, "i").test(hay)) return slug;
  }
  return "other";
}

/** 标签规则：从文本里抽公共标签（自由标签，不做树）。
 *  只保留可证实的中性标签，避免主观评价词。 */
const TAG_RULES = [
  [/免费|Free|试用|额度/i, "免费额度"],
  [/开源|OpenSource|Open Source/i, "开源"],
  [/多模型|聚合|Multi-?model/i, "多模型"],
  [/零代码|No-?code|低代码/i, "零代码"],
  [/浏览器插件|扩展|Extension|Chrome/i, "浏览器扩展"],
  [/API/i, "API"],
  [/企业|Enterprise|B端/i, "企业级"],
  [/移动端|App|iOS|Android|手机/i, "移动端"],
  [/中文|国产|国内/i, "中文友好"],
  [/本地|离线|自托管|Self-?host/i, "本地部署"],
];

/** 从原始文本抽取标签数组（去重、保序、限量）。 */
export function extractTags(...texts) {
  const hay = texts.filter(Boolean).join(" ");
  const out = [];
  for (const [re, tag] of TAG_RULES) if (re.test(hay) && !out.includes(tag)) out.push(tag);
  return out.slice(0, 6);
}

/** 定价推断：从文本猜 免费/免费增值/付费。
 *  诚实交代：首页列表页简介极短（多 <30 字），实测 90% 判不出（unknown）。
 *  宁可 unknown 也不硬凑——UI 对未知不显示定价标签，不误导。 */
export function inferPricing(...texts) {
  const hay = texts.filter(Boolean).join(" ");
  const hasFree = /免费|Free|试用|额度|FREEMIUM/i.test(hay);
  const hasPaid = /付费|订阅|收费|Pro|会员|升级|Premium|Paid/i.test(hay);
  if (hasFree && hasPaid) return "freemium";
  if (hasFree) return "free";
  if (hasPaid) return "paid";
  return "unknown";
}

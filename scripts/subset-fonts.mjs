// scripts/subset-fonts.mjs —— 构建后按站内实际用到的字符集原地裁剪 out/ 下的字体文件
//
// 背景（2026-09-30 CI 实测）：@fontsource 的 noto-serif-sc 中文子集单文件 1.44~1.56MB，
// 700/900 两个字重合计 ~3MB。Lighthouse desktop 预设（模拟 10Mbps 带宽）下，masthead h1
// （font-weight:900）要等 900 字体落地才完成 LCP 绘制，LCP 被顶到 2.6~3.2s，
// 在 2500ms 门禁上下抖动（第一轮 1874ms 过、第二轮 3153ms 挂）。网络时序取证显示字体在
// 本地服务上 12~23ms 就下载完 —— 瓶颈纯粹是「模拟带宽 × 文件体积」，不是加载顺序。
//
// 做法：扫描 out/ 全部 HTML/JS/TXT 里出现过的字符（含数字实体解码后的真实字符），
// 用 harfbuzzjs（subset-font，纯 WASM 无原生依赖）把每个字体文件裁到这个字符集，
// 原地写回。文件名是 Next 的内容哈希、CSS 引用按文件名指向 —— 原地替换后零引用改动。
// 字符集取自同一次构建的产物，所以「页面要用什么字」与「字体里有什么字」天然同步；
// 若某字符只出现在纯客户端动态输入（如用户在搜索框打的字），该字会回落到系统字体，属预期。
//
// 用法：node scripts/subset-fonts.mjs [目录]   （默认 out/；供测试用可传其它目录）
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import subsetFont from "subset-font";

const OUT = process.argv[2] ?? "out";
const FONT_DIR = join(OUT, "_next", "static", "media");
const MIN_BYTES = 50 * 1024; // 小于 50KB 的字体（latin 子集）不值得裁，避免无谓风险

// 数字/命名实体解码：HTML 里以实体形态出现的字符（如 &#x4E2D;）要换算成真实字形字符
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// 1) 收集字符集：产物里出现过的每一个字符都进子集
const chars = new Set();
for (const ch of "0123456789") chars.add(ch); // 数字兜底（表格/日期高频）
for await (const p of walk(OUT)) {
  const ext = extname(p).toLowerCase();
  if (ext !== ".html" && ext !== ".js" && ext !== ".txt" && ext !== ".xml") continue;
  const info = await stat(p);
  if (info.size > 8 * 1024 * 1024) continue; // 防御：跳过异常大文件（不该存在）
  const text = decodeEntities(await readFile(p, "utf8"));
  for (const ch of text) chars.add(ch);
}
const charset = [...chars].join("");
const cjkCount = [...chars].filter((c) => /\p{Script=Han}/u.test(c)).length;
console.log(`[subset-fonts] 字符集：${chars.size} 个唯一字符（其中汉字 ${cjkCount}）`);

// 2) 逐字体原地裁剪
let before = 0, after = 0, touched = 0;
for await (const p of walk(FONT_DIR)) {
  const ext = extname(p).toLowerCase().slice(1); // woff2 / woff
  if (ext !== "woff2" && ext !== "woff") continue;
  const buf = await readFile(p);
  if (buf.length < MIN_BYTES) continue;
  const target = await subsetFont(buf, charset, { targetFormat: ext });
  if (target.length >= buf.length) {
    console.log(`[subset-fonts] 跳过（未变小）${p.slice(-60)} ${buf.length}B`);
    continue;
  }
  await writeFile(p, target);
  before += buf.length; after += target.length; touched++;
  console.log(`[subset-fonts] ${p.slice(-60)} ${buf.length}B → ${target.length}B`);
}
console.log(`[subset-fonts] 完成：${touched} 个字体文件，${before}B → ${after}B（省 ${before - after}B）`);

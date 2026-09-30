/** 构建后对真实产物做红线检查：零引流、版面完整、双主题令牌落地 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const OUT = path.resolve(process.cwd(), "out");
if (!existsSync(OUT)) throw new Error("缺 out/：先跑 npm run build 再执行本检查");
/* 分享面（canonical / og:image）只有两种可接受形态：线上口径=站点绝对地址（SITE 已含仓库子路径），
   本地口径=带 BASE 的相对路径或由 Next 默认 origin 补全。BASE 叠两次是 Step 10 实测踩过的坑。 */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".html")) htmlFiles.push(full);
  }
})(OUT);

const dirsOf = (rel) =>
  readdirSync(path.join(OUT, rel)).filter((n) => statSync(path.join(OUT, rel, n)).isDirectory());

test("产物数量合理（首页 + 18 详情页 + 4 内容页）", () => {
  assert.ok(existsSync(path.join(OUT, "index.html")), "缺 out/index.html");
  assert.equal(dirsOf("intel").length, 18, "详情页数量应与 visibleCards 一致");
  for (const p of ["about", "editorial-policy", "privacy", "contact"]) {
    assert.ok(existsSync(path.join(OUT, p, "index.html")), `缺内容页 /${p}/`);
  }
  /* 实测 25 = 首页 1 + 详情页 18 + 内容页 4 + 404 两份；取下界 23 留一点余量 */
  assert.ok(htmlFiles.length >= 23, `HTML 仅 ${htmlFiles.length} 个，疑似路由未生成`);
});

/** 与 brief 的唯一偏差：invite_code 补等号。editorial-policy 页按规范逐字公示清洗参数名
 *  （`<code>invite_code</code>` 后无等号），真实引流痕迹恒为 `?invite_code=<码>` 查询串形态；
 *  加等号后文档公示不误报、引流串仍被红线覆盖。其余四键（码值/物料名）无此歧义，保持原样。 */
test("全部产物零原作者引流痕迹", () => {
  const bad = [];
  for (const f of htmlFiles) {
    const s = readFileSync(f, "utf8");
    if (/lmfh2022|userCode=|invite_code=|AATGOEHF|poster-doubao-laxin/.test(s)) bad.push(path.relative(OUT, f));
  }
  assert.deepEqual(bad, [], "以下产物含引流痕迹");
});

test("首页版面区块齐全", () => {
  const s = readFileSync(path.join(OUT, "index.html"), "utf8");
  for (const t of ["Token 情报局", "今日头条", "大模型", "编程工具", "合作情报", "观望名单", "加入情报群"]) {
    assert.ok(s.includes(t), `首页缺「${t}」`);
  }
});

test("暗色令牌已随产物落地", () => {
  const css = readdirSync(path.join(OUT, "_next", "static", "css"))
    .map((f) => readFileSync(path.join(OUT, "_next", "static", "css", f), "utf8"))
    .join("");
  for (const v of ["#f6f4ee", "#0f966e", "#101815", "#7fd8b0"]) {
    assert.ok(css.includes(v), `样式缺令牌色 ${v}`);
  }
});

test("情报卡卡脚不使用绝对定位邮戳（spec §5.3 v2）", () => {
  const s = readFileSync(path.join(OUT, "index.html"), "utf8");
  const intelCards = s.split('class="intel-card"').length - 1;
  assert.ok(intelCards >= 8, `情报卡只有 ${intelCards} 张，疑似未渲染`);
  assert.ok(!/<div class="stamp[^>]*top:/.test(s), "情报卡里混入了大邮戳");
});

/* —— 以下 3 条来自审查台账 T6：N-3 兑现步骤名承诺的微信号断言 + L1 的抓取/分享面 —— */

test("微信号占位与配置一致（deploy.yml:44 步骤名的真断言）", () => {
  const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), "config", "site-config.json"), "utf8"));
  const home = readFileSync(path.join(OUT, "index.html"), "utf8");
  if (cfg.wechatId) {
    assert.ok(home.includes(`复制微信号 ${cfg.wechatId}`), "配置了微信号却没渲染出复制按钮");
    assert.ok(!home.includes("微信号待配置"), "配置了微信号却仍显示占位文案");
  } else {
    assert.ok(home.includes("微信号待配置"), "空微信号必须显示「微信号待配置」");
    assert.ok(!home.includes("复制微信号"), "空微信号不得出现可复制按钮");
  }
});

test("首页含 og:image 与 twitter 大图卡，且声明尺寸等于图片真实尺寸", () => {
  const home = readFileSync(path.join(OUT, "index.html"), "utf8");
  /* 精确钉形态：宽松匹配 assets/og-cover.png 时，双前缀（…/token-fbi-next/token-fbi-next/…）也能过，
     95e6948 漏提交 layout.tsx 就是被这条无牙断言放过去的，故这里按口径逐一等值/前缀校验。 */
  const og = /property="og:image" content="([^"]+)"/.exec(home)?.[1] || "";
  if (SITE) {
    assert.equal(og, `${SITE}/assets/og-cover.png`, "线上口径 og:image 必须等于站点地址下的封面");
  } else {
    assert.ok(og.endsWith(`${BASE}/assets/og-cover.png`), `本地口径 og:image 形态意外：${og}`);
    if (BASE) assert.ok(!og.includes(`${BASE}${BASE}`), "og:image 前缀被叠了两次（layout 须走 canonicalAsset）");
  }
  assert.ok(home.includes('name="twitter:card" content="summary_large_image"'), "twitter 卡未升级为大图");
  const png = readFileSync(path.join(OUT, "assets", "og-cover.png"));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "og-cover.png 不是合法 PNG");
  assert.equal(png.readUInt32BE(16), 1536, "PNG 实际宽度 ≠ metadata 声明宽度");
  assert.equal(png.readUInt32BE(20), 1024, "PNG 实际高度 ≠ metadata 声明高度");
});

test("robots.txt 随产物落地；有站点地址时 sitemap 与产物页集合一致", () => {
  assert.ok(existsSync(path.join(OUT, "robots.txt")), "缺 out/robots.txt：npm run build 后要跑 npm run seo");
  if (!SITE) {
    /* 本地口径：绝不允许把占位域名或相对 loc 写进产物 */
    assert.ok(!existsSync(path.join(OUT, "sitemap.xml")), "本地口径不该出 sitemap");
    assert.ok(!readFileSync(path.join(OUT, "robots.txt"), "utf8").includes("Sitemap:"), "无站点地址不得写 Sitemap 行");
    return;
  }
  const locs = [...readFileSync(path.join(OUT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, dirsOf("intel").length + 5, "sitemap 条数 = 首页 1 + 内容页 4 + 详情页 N");
  for (const l of locs) assert.ok(l.startsWith(`${SITE}/`), `loc 不是本站绝对地址：${l}`);
  assert.ok(!locs.some((l) => /\/(404|admin)\//.test(l)), "sitemap 混入了 404/admin 地址");
  /* canonical 是本页唯一的地道地址：两种可接受形态（Next 依 metadataBase 解析成绝对地址，
     或原样输出带 BASE 的相对路径）都算对，但前缀绝不许重复，也绝不许缺。 */
  const home = readFileSync(path.join(OUT, "index.html"), "utf8");
  const canon = /rel="canonical" href="([^"]+)"/.exec(home)?.[1] || "";
  assert.ok(canon === `${SITE}/` || canon === `${BASE}/`, `首页 canonical 形态意外：${canon}`);
  /* BASE 为空（自定义域名直挂根）时 includes("") 恒真，必须带条件才不至于自己把门门禁调红 */
  if (BASE) assert.ok(!canon.includes(`${BASE}${BASE}`), "canonical 前缀被叠了两次");
});

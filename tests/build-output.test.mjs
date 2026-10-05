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
/* React SSR 在相邻文本节点之间插注释分隔符：JSX 的 `复制微信号 {wechatId}` 落地为
   `复制微信号 <!-- -->wxid…`。断言含变量插值的文案前先剥掉它，否则配置态必假红
   （T6 评审 Important-3，评审人用 renderToString 直证）。 */
const flat = (html) => html.replace(/<!--\s*-->/g, "");
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

test("产物数量合理（首页 + 详情页 + 4 内容页）", () => {
  assert.ok(existsSync(path.join(OUT, "index.html")), "缺 out/index.html");
  /* 详情页数量原来钉死 18，那是「visibleCards 恰好有 18 张」的数据快照，不是契约：
     crawler 每加一张卡它就假红一次。这里改成两条与数据增长无关的不变式——
       ① 下界：跌破 18 说明构建退化（路由没生成 / 规则表漂移 / 数据文件损坏）；
       ② 每个 intel 目录都必须真的产出 index.html（空目录 = 路由生成了但页面没写出来）。
     「详情页数 == visibleCards 长度」这条等值红线挪到了 tests/catalog.test.ts 的 slug 唯一性用例，
     那里能 import src/lib/catalog.ts 的真实实现；本文件是 .mjs 跑 node，无法复用 TS 实现，
     在这里手写第二份 visibleCards 过滤逻辑只会在两处漂移时给出假绿。 */
  const intelDirs = dirsOf("intel");
  assert.ok(intelDirs.length >= 18, `详情页仅 ${intelDirs.length} 个，低于下界 18，疑似路由未生成`);
  for (const d of intelDirs) {
    assert.ok(existsSync(path.join(OUT, "intel", d, "index.html")), `详情页 /intel/${d}/ 缺 index.html`);
  }
  for (const p of ["about", "editorial-policy", "privacy", "contact", "openrouter"]) {
    assert.ok(existsSync(path.join(OUT, p, "index.html")), `缺内容页 /${p}/`);
  }
  /* 实测 27 = 首页 1 + 详情页 19 + 内容页 5（含 /openrouter/ 台账页）+ 404 两份；取下界 23 留一点余量 */
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

/* 上线链产物面：台账数据进仓库必须真的出现在站点产物里（页面有数据时模型表完整渲染，
   数据缺席时才允许空态——空态文案与模型表二者必居其一，不许「有数据却不渲染表头」）。 */
test("OpenRouter 台账页在产物里：模型表或空态必居其一", () => {
  const s = readFileSync(path.join(OUT, "openrouter", "index.html"), "utf8");
  assert.ok(s.includes("OpenRouter 免费模型台账"), "台账页缺页名");
  const hasTable = s.includes('class="or-table"');
  const hasEmpty = s.includes("台账暂无数据");
  assert.ok(hasTable !== hasEmpty, "台账页「模型表」与「空态」必须互斥：数据在就渲染表，数据缺就空态");
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

test("微信号占位与配置一致（deploy.yml 产物红线步骤名的真断言）", () => {
  const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), "config", "site-config.json"), "utf8"));
  const home = flat(readFileSync(path.join(OUT, "index.html"), "utf8"));
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
  assert.equal(locs.length, dirsOf("intel").length + 6, "sitemap 条数 = 首页 1 + 内容页 5（含 openrouter）+ 详情页 N");
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

/* —— 计划 5 Task 12（§7-7/§7-8）：/admin 的产物存在性 + 「不进取索引面」的产物级证据。
   刻意不并进上方遍历 about/editorial-policy/privacy/contact 的那个内容页循环：/admin 不是内容页，它进的是「路由已生成且不被索引」这一组独立红线。 */
test("/admin 已进产物且带 noindex（§7-8）", () => {
  const adminPath = path.join(OUT, "admin", "index.html");
  assert.ok(existsSync(adminPath), "缺 out/admin/index.html：/admin 路由没进产物");
  const admin = readFileSync(adminPath, "utf8");
  /* 形态出自 next 的 robots 解析器（node_modules/next/dist/lib/metadata/resolvers/resolve-basics.js:130-145：
     index:false → "noindex"，follow:true → "follow"，values.join(", ")）。
     匹配到 content 值的右引号为止，不把自闭合写法（"/>" 还是 ">"）钉进去——那是 React 的渲染细节，不是本站的承诺。
     真正的承诺是「noindex 在、且和 follow 一起出现」：只写 noindex 不给 follow，爬虫就不跟站内链接，前台的更新会被拖慢。 */
  assert.match(admin, /<meta name="robots" content="noindex, follow"/);
  /* 反向牙：前台首页不许出现 noindex。首页一旦被误挂，整站自然搜索归零，而这在 /admin 那一行同样改一行 metadata 就能发生。 */
  assert.ok(!readFileSync(path.join(OUT, "index.html"), "utf8").includes("noindex"), "首页被挂上了 noindex");
});

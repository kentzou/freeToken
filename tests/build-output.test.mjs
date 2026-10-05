/** 构建后对真实产物做红线检查：零引流、版面完整、双主题令牌落地 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { publishesSitemap, roleOf } from "../scripts/gen-seo.mjs";

const OUT = path.resolve(process.cwd(), "out");
if (!existsSync(OUT)) throw new Error("缺 out/：先跑 npm run build 再执行本检查");
/* 抓取面口径与 npm run seo 用的是同一个 roleOf：产物按 A 口径生成、检查按 B 口径判定，
   就等于这条自检没有牙。拼错的 NEXT_PUBLIC_SITE_ROLE 在这里同样当场红。 */
const ROLE = roleOf(process.env.NEXT_PUBLIC_SITE_ROLE);
const MIRROR = !publishesSitemap(ROLE);
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
  /* 总量用「详情页 + 固定页」的相对式而不是绝对数：crawler 每加一张卡绝对数就腐一次。
     固定面实测 9 = 首页 1 + 内容页 5（about / editorial-policy / privacy / contact / openrouter 台账页）
     + /admin/ 1 + 404 两份（404.html 与 404/index.html）。 */
  assert.ok(
    htmlFiles.length >= intelDirs.length + 9,
    `HTML 共 ${htmlFiles.length} 个，少于「详情页 ${intelDirs.length} + 固定页 9」，疑似路由未生成`
  );
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

/* 形态面：OpenRouter 已改判为普通情报卡，首页不再有它专用的 .or-entry 长条。产物侧钉三条：
   ① 长条归零；② 它拿到了普通卡才有的详情页产物（/intel/openrouter/）；
   ③ 首页下发的卡数据里带台账副按钮（extraAction → /openrouter/）。
   ③ 只在 RSC payload 里：区块默认只渲染前 4 张卡，OpenRouter 按现有排序排在第 11 位，
      点击「查看全部」才进 DOM——所以这里断言的是「数据已随首页下发、展开即可渲染」，
      而不是「首屏可见」；区块归属（大模型）由 tests/catalog.test.ts 用生产代码判定。
   payload 里的字符串带反斜杠转义，断言前先剥掉反斜杠归一，免得把转义形态写死成脆弱钉子。 */
test("OpenRouter 改判普通卡：长条归零、详情页产物存在、首页卡数据带台账入口", () => {
  const s = readFileSync(path.join(OUT, "index.html"), "utf8");
  assert.equal(s.split("or-entry").length - 1, 0, "首页仍有 or-entry 长条残留");
  assert.ok(existsSync(path.join(OUT, "intel", "openrouter", "index.html")), "缺 /intel/openrouter/ 详情页（普通卡管线没走到它）");
  const flat = s.replace(/\\/g, "");
  assert.ok(
    /"name":"OpenRouter"[\s\S]{0,900}?"extraAction":\{"text":"免费模型台账","link":"\/openrouter\/"\}/.test(flat),
    "首页下发的 OpenRouter 卡数据里没有台账副按钮"
  );
});

/* 详情页是「点进卡片之后」的落点：台账入口只挂在首页卡上时，详情页就成了死胡同。
   这条钉 /intel/openrouter/ 的**静态 markup**（不是 payload）里确有指向台账页的副按钮，
   且它与「前往平台领取」「返回目录」同处 .detail-acts 动作行。
   href 按口径有三态：本地 /openrouter/、Pages /freeToken/openrouter/、镜像 /openrouter/index.html
   （镜像托管关掉目录索引，站内链接只能指向真实文件，见 pageHref），期望值随口径算，不写死。 */
const ledgerHref = MIRROR ? `${BASE}/openrouter/index.html` : `${BASE}/openrouter/`;
test("详情页也带台账入口：/intel/openrouter/ 的动作行里有指向台账页的按钮", () => {
  const f = path.join(OUT, "intel", "openrouter", "index.html");
  assert.ok(existsSync(f), "缺 /intel/openrouter/ 详情页产物");
  const s = readFileSync(f, "utf8");
  const acts = /<div class="detail-acts">([\s\S]*?)<\/div>/.exec(s);
  assert.ok(acts, "详情页没有 .detail-acts 动作行");
  assert.ok(
    acts[1].includes(`href="${ledgerHref}"`) && acts[1].includes("免费模型台账"),
    `详情页动作行里找不到台账入口（期望 href="${ledgerHref}"）`
  );
  assert.ok(acts[1].includes("返回目录"), "详情页动作行丢了返回目录");
});

/* 站内页面链接的形态就是「这台主机能不能解析目录索引」。Qoder Sites 的静态托管关掉了目录索引
   （实测 /intel/openrouter/ 不落到该目录的 index.html，而是 200 回落到首页），镜像产物只能指真实文件名；
   主站反过来——多一个 /index.html 就等于给同一内容造第二个 URL。两种口径各钉一条，
   改造只在 lib 里做、产物面上不咬住是不算数的。 */
test("站内页面链接形态随口径落地：镜像全带 index.html，主站全为 clean URL", () => {
  /* 先剥 BASE 再判资源：Pages 口径下资源路径是 /freeToken/assets/…，不剥就漏判成页面链接。 */
  const relOf = (h) => (BASE && h.startsWith(`${BASE}/`) ? h.slice(BASE.length) : h);
  const isAsset = (r) => /^(\/)?(_next\/|assets\/)|\.(png|jpe?g|svg|css|js|ico|txt|xml|webmanifest|json|webp)$/i.test(r);
  const bad = [];
  let pages = 0;
  for (const f of htmlFiles) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/href="(\/[^"#]*?)"/g)) {
      const h = m[1];
      if (h.startsWith("//")) continue;
      const rel = relOf(h);
      if (isAsset(rel)) continue;
      pages += 1;
      const ok = h === `${BASE}/` || (MIRROR ? h.endsWith("/index.html") : h.endsWith("/"));
      if (!ok) bad.push(`${f.replace(OUT, ".")} → ${h}`);
    }
  }
  assert.ok(pages > 0, "一条站内页面链接都没扫到——这条自检失去被测对象");
  assert.deepEqual(bad.slice(0, 8), [], `${MIRROR ? "镜像" : "主站"}口径下的站内页面链接形态不符（共 ${bad.length} 处）`);
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
  /* 镜像口径：SITE 是主站地址（canonical 靠它），但本站主机上不供 sitemap——
     跨主机的 loc 清单按 sitemaps.org 需另行验证才生效，静默无效比 404 更难发现。 */
  if (MIRROR) {
    assert.ok(SITE, "镜像口径必须给 NEXT_PUBLIC_SITE_URL（主站地址），否则 canonical 只是相对路径，镜像就没意义");
    assert.ok(!existsSync(path.join(OUT, "sitemap.xml")), "镜像口径不该出 sitemap.xml");
    assert.ok(!readFileSync(path.join(OUT, "robots.txt"), "utf8").includes("Sitemap:"), "镜像口径不得声明 Sitemap 行");
    /* 逐文件核 noindex，漏一页就等于那一页在第二个主机上重新参与排名。
       刻意不写「共 N 页」这种绝对数：卡数会长，绝对数只会在下次加卡时假红（同 intel 下界那条的教训）。 */
    for (const f of htmlFiles) {
      assert.match(
        readFileSync(f, "utf8"),
        /<meta name="robots" content="noindex, follow"/,
        `镜像口径下该页没带 noindex：${path.relative(OUT, f)}`
      );
    }
  } else if (!SITE) {
    /* 本地口径：绝不允许把占位域名或相对 loc 写进产物 */
    assert.ok(!existsSync(path.join(OUT, "sitemap.xml")), "本地口径不该出 sitemap");
    assert.ok(!readFileSync(path.join(OUT, "robots.txt"), "utf8").includes("Sitemap:"), "无站点地址不得写 Sitemap 行");
    return;
  } else {
    const locs = [...readFileSync(path.join(OUT, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, dirsOf("intel").length + 6, "sitemap 条数 = 首页 1 + 内容页 5（含 openrouter）+ 详情页 N");
    for (const l of locs) assert.ok(l.startsWith(`${SITE}/`), `loc 不是本站绝对地址：${l}`);
    assert.ok(!locs.some((l) => /\/(404|admin)\//.test(l)), "sitemap 混入了 404/admin 地址");
  }
  /* canonical 是本页唯一的地道地址：两种可接受形态（Next 依 metadataBase 解析成绝对地址，
     或原样输出带 BASE 的相对路径）都算对，但前缀绝不许重复，也绝不许缺。
     镜像口径下这条尤其要紧——它正是「把权重归给主站」的落点，SITE 给的就是主站地址。 */
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
  /* 首页的 meta robots 只随部署口径变，两种口径都必须被显式检查（留空等于这一路无人守）：
     主站——首页挂上 noindex 就整站自然搜索归零，而这和 /admin 那一行是同一种改法；
     镜像——全站 noindex 是「副本站不争排名」的承诺本体，漏了就是把副本当主站投进索引，
     于是又回到「两个主机抢同一个关键词、canonical 还说谎」的原点。 */
  const homeHtml = readFileSync(path.join(OUT, "index.html"), "utf8");
  if (MIRROR) {
    assert.match(homeHtml, /<meta name="robots" content="noindex, follow"/, "镜像口径的首页没带 noindex");
  } else {
    assert.ok(!homeHtml.includes("noindex"), "首页被挂上了 noindex");
  }
});

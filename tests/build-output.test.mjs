/** 构建后对真实产物做红线检查：零引流、版面完整、双主题令牌落地 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const OUT = path.resolve(process.cwd(), "out");
if (!existsSync(OUT)) throw new Error("缺 out/：先跑 npm run build 再执行本检查");
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

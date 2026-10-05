/** 文字令牌 × 底色 的对比度围栏（F7 用 axe-core 在真实浏览器里量到两条 serious color-contrast 缺陷，这里钉机制）：
 *  admin.css 与 app.css 的小字（11–13px、normal weight）一律直接取 tokens.css 的文字令牌，所以只要这张
 *  「令牌配对表」在浅、暗两套主题下都 ≥ WCAG AA 的 4.5:1，同类缺陷就不会再随新面板长回来。
 *  配对取自实际消费点，不是凭空组合：ink-4 落在 surface（.adm-meta/.adm-why/.adm-hint/.detail-note）、
 *  surface-2（.last-check）与 bg（.empty-state .hint）三处，就三处都量。
 *  半透明底色（暗色档的 --brand-soft/--warn-bg 是 rgba）先与它下面那层不透明底做 alpha 合成再算比值——
 *  合成口径已按浏览器实测校准：axe 报出的背景色 #23221e 正是 #a14141 一成透明度铺在 --surface(#151f1a) 上的结果。 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/tokens.css", "utf8");

/** 按「块」取自定义属性：浅色在 :root，暗色在 [data-theme="dark"] 且只覆盖列出的名字，其余沿用浅色档。 */
function block(selector: string): string {
  const from = css.indexOf(selector);
  expect(from, `tokens.css 里找不到 ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", from);
  const close = css.indexOf("\n}", open);
  expect(close, `${selector} 块没有闭合`).toBeGreaterThan(open);
  return css.slice(open, close);
}
const entries = (chunk: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of chunk.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};
const light = entries(block(":root"));
const dark = { ...light, ...entries(block('[data-theme="dark"]')) };

type Rgb = [number, number, number, number];

const toRgb = (value: string): Rgb => {
  if (value.startsWith("#")) {
    const h = value.slice(1);
    expect(h.length, `颜色 ${value} 不是六位十六进制`).toBe(6);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(value);
  expect(m, `认不出的颜色写法：${value}`).not.toBeNull();
  const p = m![1].split(",").map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
const relLum = (c: Rgb): number =>
  [c[0], c[1], c[2]]
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
/** 背景可以写成 "token" 或 "tokenA over tokenB"（前者半透明时必须有落底的实色） */
const background = (spec: string, T: Record<string, string>): Rgb => {
  const [tintSpec, onSpec] = spec.split(" over ");
  const tint = toRgb(T[tintSpec]);
  if (tint[3] === 1 || !onSpec) return tint;
  const on = toRgb(T[onSpec]);
  const a = tint[3];
  return [0, 1, 2].map((i) => Math.round(a * tint[i] + (1 - a) * on[i])) as Rgb;
};
const ratio = (fgSpec: string, bgSpec: string, T: Record<string, string>): number => {
  const fg = toRgb(T[fgSpec]);
  const bg = background(bgSpec, T);
  const [hi, lo] = [relLum(fg), relLum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

/* [文字令牌, 底色, 消费它的选择器（为什么这一对真实存在）] */
const PAIRS: [string, string, string][] = [
  ["--ink-1", "--bg", "body 正文"],
  ["--ink-1", "--surface", ".adm-card h3 / .adm-sub"],
  ["--ink-2", "--surface", ".adm-field label / .adm-top .adm-who"],
  ["--ink-2", "--surface-2", ".adm-statebar.info"],
  ["--ink-2", "--bg", ".adm-field input 的底色"],
  ["--ink-3", "--surface", ".adm-count / .adm-receipt / .adm-hist th"],
  ["--ink-3", "--surface-2", ".adm-note / .or-table thead th"],
  ["--ink-3", "--bg", ".site-footer"],
  ["--ink-4", "--surface", ".adm-meta / .adm-why / .adm-hint / .detail-note"],
  ["--ink-4", "--surface-2", ".last-check"],
  ["--ink-4", "--bg", ".empty-state .hint"],
  ["--brand-deep", "--surface", "a 链接 / .adm-nf"],
  ["--brand-deep", "--brand-soft over --surface", ".adm-badge.ok / .adm-diff .add / .adm-statebar.ok / .adm-tab:hover"],
  ["--warn-ink", "--warn-bg over --surface", ".adm-kind.mod / .adm-badge.run / .adm-statebar.warn / .adm-tab .n"],
  ["--bad-ink", "--bad-bg", ".adm-kind.del / .adm-badge.bad / .adm-statebar.bad / .adm-diff .del"],
  ["--stamp", "--surface", ".adm-stamp-mini / .stamp"],
  ["--stamp", "--bg", "整页大戳落在页面底色上"],
];

describe("文字令牌对比度（AA 4.5:1）", () => {
  for (const [theme, T] of [
    ["浅色", light],
    ["暗色", dark],
  ] as [string, Record<string, string>][]) {
    it(`${theme}档：配对表逐条 ≥4.5，且 11–13px 小字全部按正文档判`, () => {
      const fails: string[] = [];
      for (const [fg, bg, why] of PAIRS) {
        expect(T[fg], `${theme}档缺文字令牌 ${fg}`).toBeTruthy();
        const bgToken = bg.split(" over ")[0];
        expect(T[bgToken], `${theme}档缺底色令牌 ${bgToken}`).toBeTruthy();
        const r = ratio(fg, bg, T);
        if (r < 4.5) fails.push(`${fg}(${T[fg]}) on ${bgToken}(${T[bgToken]}) = ${r.toFixed(2)}:1 ← ${why}`);
      }
      expect(fails).toEqual([]);
    });
  }

  /* 围栏自身也得有牙：把 ink-4 换回 F7 量到的那两档原值，配对表必须报红——
     否则说明这张表压根没在管这两条线。 */
  it("把 --ink-4 退回 F7 实测的旧值，配对表要报红（自校：围栏不是摆设）", () => {
    const lightRetro = { ...light, "--ink-4": "#9a938a" };
    const darkRetro = { ...dark, "--ink-4": "#5f6f66" };
    expect(ratio("--ink-4", "--surface", lightRetro)).toBeLessThan(4.5);
    expect(ratio("--ink-4", "--surface", darkRetro)).toBeLessThan(4.5);
    // 暗色档红族同理：沿用浅色 #a14141 时正是 axe 报的那条 serious
    const badRetro = { ...dark, "--bad-ink": "#a14141" };
    expect(ratio("--bad-ink", "--bad-bg", badRetro)).toBeLessThan(4.5);
  });
});

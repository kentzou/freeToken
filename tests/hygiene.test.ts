/** 注入面围栏（审查 H1′）：JSX 自动转义是新站消解旧站 DOM-XSS 的机制，
 *  但机制会被一行 dangerouslySetInnerHTML 破掉。lint 规则不覆盖这个，故用源码扫描钉住。 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(process.cwd(), "src");
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(SRC);

/* 判据覆盖 HTML 写入 sink 的全部形态：`=`/`+=` 直接赋值、计算属性名形态（el 方括号引号 innerHTML 再赋值）、
   `Object.assign(el, { innerHTML })`、`setAttribute` 属性名形态、`insertAdjacentHTML`、`document.write` 与
   `document.writeln`（同族注入原语，只差三个字母，不能只钉前者），外加 `eval` 与 `new Function`。
   `(?!=)` 排除 `innerHTML == x` 这类比较，避免把读取误判成写入。 */
const FORBIDDEN = [
  /\b(?:inner|outer)HTML\b\s*\+?=(?!=)/,
  /\[\s*["'](?:inner|outer)HTML["']\s*\]\s*\+?=(?!=)/,
  /Object\.assign\([^)]*\b(?:inner|outer)HTML\b/,
  /setAttribute\(\s*["'](?:inner|outer)HTML/,
  /insertAdjacentHTML\s*\(/,
  /document\.write(?:ln)?\s*\(/,
  /\beval\s*\(/,
  /\bnew Function\s*\(/,
];

/* 唯一豁免：layout.tsx 的 themeScript —— 首屏绘制前定 data-theme，值是本仓写死的字面量、零插值。
   豁免条件是「文件 + 命中数 1 + 标记串存在」三重，不给整文件放行。 */
const LAYOUT = path.join(SRC, "app", "layout.tsx");

describe("注入面围栏", () => {
  it("src/ 无 HTML 写入 sink（赋值/追加/计算属性名/Object.assign/setAttribute/insertAdjacentHTML/document.write 与 writeln）/ eval / new Function", () => {
    const hits: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) if (re.test(s)) hits.push(`${path.relative(SRC, f)} ← ${re.source}`);
    }
    expect(hits).toEqual([]);
  });

  it("dangerouslySetInnerHTML 全站仅 layout.tsx 的 themeScript 一处", () => {
    const hits: string[] = [];
    let layoutUses = 0;
    for (const f of files) {
      const n = readFileSync(f, "utf8").split("dangerouslySetInnerHTML").length - 1;
      if (!n) continue;
      if (f === LAYOUT) layoutUses = n;
      else hits.push(`${path.relative(SRC, f)} ×${n}`);
    }
    expect(hits).toEqual([]);
    expect(layoutUses).toBe(1);
    expect(readFileSync(LAYOUT, "utf8")).toContain("const themeScript =");
  });
});

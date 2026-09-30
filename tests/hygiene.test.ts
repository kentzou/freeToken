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

/* 判据覆盖innerHTML 的全部写入形态：直接赋值、`+=` 追加、setAttribute 属性名形态、
   outerHTML 与 insertAdjacentHTML；`(?!=)` 排除 `innerHTML == x` 这类比较，避免误报。 */
const FORBIDDEN = [
  /\binnerHTML\b\s*\+?=(?!=)/,
  /\bouterHTML\b\s*\+?=(?!=)/,
  /setAttribute\(\s*["']innerHTML/,
  /insertAdjacentHTML\s*\(/,
  /document\.write\s*\(/,
  /\beval\s*\(/,
  /\bnew Function\s*\(/,
];

/* 唯一豁免：layout.tsx 的 themeScript —— 首屏绘制前定 data-theme，值是本仓写死的字面量、零插值。
   豁免条件是「文件 + 命中数 1 + 标记串存在」三重，不给整文件放行。 */
const LAYOUT = path.join(SRC, "app", "layout.tsx");

describe("注入面围栏", () => {
  it("src/ 无 innerHTML/outerHTML 写入（含 +=、setAttribute、insertAdjacentHTML）/ document.write / eval / new Function", () => {
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

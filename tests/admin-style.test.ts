/** 样式层的三条硬事实，值得用测试钉住：
 *  ① admin.css 必须被 globals.css 引入——否则 Task 6 起所有 .adm-* 都是无样式裸 HTML；
 *  ② 本站 CSS 基座是 @media，@container 一次都不许出现（§1 红线 5，原型用的是容器查询）；
 *  ③ 组件里写到的每个 adm- 类名必须在 admin.css 里有定义——缺一条就是「有元素没样式」的静默缺陷。
 *  ④ CSS 块注释必须成对闭合——注释体内出现「星号紧跟斜杠」会提前闭合注释，残文泄进样式表（本条为执行期 C1 新增，见 Step 5 校正块）。
 *  第 ③ 条在 Task 5 时 src/app/admin 尚不存在，用例按「扫到几个就查几个」写，后续任务自动变严。 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/admin.css", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

const admFiles = existsSync("src/app/admin") ? readdirSync("src/app/admin").filter((f) => f.endsWith(".tsx")) : [];

describe("后台样式基座", () => {
  it("globals.css 引入了 admin.css", () => {
    expect(globals).toContain('@import "../styles/admin.css";');
  });

  it("只用 @media，不出现 @container；两档断点 899/639 都在", () => {
    expect(css).not.toContain("@container");
    expect(css).toContain("@media (max-width: 899px)");
    expect(css).toContain("@media (max-width: 639px)");
  });

  it("statebar 四档齐全（原型只写了 .warn；ok/bad/info 属本计划补齐，ok 由两个 receipt 函数消费）", () => {
    for (const tone of ["ok", "warn", "bad", "info"]) expect(css).toContain(`.adm-statebar.${tone}`);
  });

  it("复用前台既有实现，不新造邮戳与按钮：文件里不得出现 .stamp 的第二次定义", () => {
    expect(css).not.toMatch(/^\.stamp\s*\{/m);
    expect(css).not.toMatch(/^\.btn-primary\s*\{/m);
    expect(css).toContain(".adm-stampbox .stamp");
  });

  it("组件里出现的每个 adm- 类名都在 admin.css 有定义（缺一个就报缺哪个）", () => {
    const defined = new Set([...css.matchAll(/\.(adm-[a-z0-9-]+)/g)].map((m) => m[1]));
    const missing = new Set<string>();
    for (const f of admFiles) {
      const src = readFileSync(`src/app/admin/${f}`, "utf8");
      for (const m of src.matchAll(/adm-[a-z0-9-]+/g)) if (!defined.has(m[0])) missing.add(`${m[0]}（${f}）`);
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("块注释成对闭合：注释体内不得出现星号紧跟斜杠，否则提前闭合后残文会让 cssnano 构建失败", () => {
    const markers = [...css.matchAll(/\/\*|\*\//g)].map((m) => m[0]);
    expect(markers.length).toBeGreaterThan(0);
    markers.forEach((mk, i) => expect(mk).toBe(i % 2 === 0 ? "/*" : "*/"));
  });
});

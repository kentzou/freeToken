/** 本文件钉的是「测试基座」本身：后续六组组件用例（admin-shell/review/config-ui/crawl/history）
 *  全部假设 node 环境能渲 .tsx。这个假设一旦被回退（改了 tsconfig、换了 vitest 版本、
 *  有人删掉 esbuild 覆盖），必须在这里先红，而不是让六个组件任务同时报「渲染不出来」。 */
import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

function Probe({ checked }: { checked: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="adm-switch">
      <span className="visually-hidden">审核模式</span>
    </button>
  );
}

it("vitest 收得进 tests/**/*.test.tsx（include 必须同时含 .ts 与 .tsx）", () => {
  expect(true).toBe(true);
});

it("node 环境渲出的标记带真实 role/aria/class（组件可测性的唯一依据）", () => {
  expect(renderToStaticMarkup(<Probe checked />)).toBe(
    '<button type="button" role="switch" aria-checked="true" class="adm-switch"><span class="visually-hidden">审核模式</span></button>',
  );
});

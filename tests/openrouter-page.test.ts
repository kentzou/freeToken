import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OpenRouterTable from "../src/components/OpenRouterTable";
import type { OpenRouterLedgerModel } from "../src/lib/types";

/** 页面降级红线：models 为空时不渲染空表头，只给空态；有数据时表头与行齐全。
 *  与抓取器同向的 fail-safe：空台账（数据缺席）时页面不出现「有列无行」的假表。 */
describe("OpenRouterTable 空态降级", () => {
  it("models 为空 → 不渲染 <table>，只出现空态文案", () => {
    const html = renderToString(createElement(OpenRouterTable, { models: [] }));
    expect(html).not.toContain("<table");
    expect(html).toContain("台账暂无数据");
  });

  it("有数据 → 表头六列齐全，行内 null 字段降级为占位符", () => {
    const row: OpenRouterLedgerModel = {
      id: "x/y:free",
      name: "X Y (free)",
      freeVariant: true,
      tokenPriceZero: true,
      quotaRef: "quotaPolicy",
      contextLength: null,
      maxCompletionTokens: null,
      modality: null,
      moderated: false,
    };
    const html = renderToString(createElement(OpenRouterTable, { models: [row] }));
    expect(html).toContain("<table");
    for (const col of ["模型", "名称", "上下文", "最大输出", "模态", "免费判据"]) {
      expect(html).toContain(col);
    }
    expect(html).toContain("—");
    expect(html).toContain(":free 变体");
  });
});

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog, readOpenRouterLedger } from "../src/lib/data.server";

/** 数据接入（数据进仓库后真的被站点消费）：
 *  - openrouter.json 缺席/损坏时退回最小空台账，不得 throw（第二数据源缺席不得染红构建）；
 *  - 真实台账经 loadCatalog 完整进入 Catalog.openrouter。 */
describe("OpenRouter 台账接入（data.server.ts 宽容读取）", () => {
  it("文件缺席 → 最小空台账：字段齐、models 空、计数 0，不抛错", () => {
    const empty = readOpenRouterLedger(mkdtempSync(path.join(tmpdir(), "or-missing-")));
    expect(empty.models).toEqual([]);
    expect(empty.freeModelCount).toBe(0);
    expect(empty.fetchedAt).toBe("");
    expect(empty.quotaPolicy.perModelAllocation).toBeNull();
  });

  it("JSON 损坏 → 同样退回空台账（形态与缺席同向 fail-safe）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "or-bad-"));
    // 故意建 data/ 子目录再写坏文件：坏 JSON 与缺席走同一个空台账出口，都不 throw
    mkdirSync(path.join(dir, "data"));
    writeFileSync(path.join(dir, "data", "openrouter.json"), "{不是 json");
    const bad = readOpenRouterLedger(dir);
    expect(bad.models).toEqual([]);
    expect(bad.freeModelCount).toBe(0);
  });

  it("真实台账经 loadCatalog 完整进入 Catalog.openrouter（首份快照 20 个免费模型）", () => {
    const { openrouter } = loadCatalog();
    expect(openrouter.freeModelCount).toBe(20);
    expect(openrouter.models).toHaveLength(20);
    expect(openrouter.models[0]).toMatchObject({ id: "cohere/north-mini-code:free", freeVariant: true });
    /* 额度口径唯一事实源在台账：逐模型不复制数值，只留 quotaRef 指回顶层 */
    expect(openrouter.models.every((m) => m.quotaRef === "quotaPolicy")).toBe(true);
    expect(openrouter.quotaPolicy.requestsPerMinute).toBe(20);
  });
});

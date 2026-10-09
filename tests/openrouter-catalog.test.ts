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

  it("真实台账经 loadCatalog 完整进入 Catalog.openrouter（只钉不变量，不钉上游快照值）", () => {
    /* 本用例读的是 data/openrouter.json —— crawl-openrouter 每天覆盖它，所以这里只允许钉结构不变量。
       反例（2026-10-06 实测事故）：原先写死 freeModelCount=20 与 models[0].id=
       cohere/north-mini-code:free，上游一次正常换代把首位换成 apodex/apodex-1.1-mini:free，
       deploy 的 quality job 就此永久红灯（#20–#27 连续八次），台账抓取天天成功而 Pages 停在旧产物。
       「今天上游给了什么」属于快照，归 tests/openrouter.test.ts——那边吃 fixture，值不会自己漂。 */
    const { openrouter } = loadCatalog();
    /* 真读到了磁盘台账（退回最小空台账时 fetchedAt 是空串、计数是 0，这两条会当场红） */
    expect(openrouter.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(openrouter.totalModels).toBeGreaterThan(0);
    expect(openrouter.freeModelCount).toBeGreaterThan(0);
    /* 顶层计数与数组自洽：buildSeed 类「计数与内容脱节」的缺陷只能由这条拦 */
    expect(openrouter.models).toHaveLength(openrouter.freeModelCount);
    /* 台账准入规则（与 crawler/openrouter.mjs 同一条口径，不另立第二套）：
       收录 = id 以 :free 结尾 或 prompt/completion 单价均为 0；freeVariant 只标前者。
       09-30 与 10-08 两份真实快照实测：20 条全部 tokenPriceZero=true，其中 16 条同时带 :free 后缀，
       所以断言写成「every freeVariant===true」会当场红——那是把一条通道当成了必要条件。 */
    expect(openrouter.models.every((m) => m.freeVariant === m.id.endsWith(":free"))).toBe(true);
    expect(openrouter.models.every((m) => m.freeVariant || m.tokenPriceZero)).toBe(true);
    /* 逐模型不复制额度数值，只留 quotaRef 指回顶层 */
    expect(openrouter.models.every((m) => m.quotaRef === "quotaPolicy")).toBe(true);
    /* 额度政策取「有正数值」而不钉死 20：政策本身改版时应由台账带着页面一起变，不该红在门禁里 */
    expect(openrouter.quotaPolicy.requestsPerMinute).toBeGreaterThan(0);
  });
});

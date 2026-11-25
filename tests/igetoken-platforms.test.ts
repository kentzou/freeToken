import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_IGETOKEN_PLATFORMS, readIgetokenPlatforms } from "../src/lib/data.server";

/* data/igetoken.json 是「平台线索台账」（crawler/igetoken.mjs 产物），与快讯台账分属两份文件。
   页面只渲染 name/category/checkedAt/url 四项事实——这里钉的正是「读者能看到的四个字段必须齐」，
   以及「自述条数与解析条数对账」这条改版警报线（对不上就是有卡没被认出来，不能静默展示少一半）。 */

describe("readIgetokenPlatforms：缺席不得染红构建（与 openrouter / igetoken 同宽容语义）", () => {
  it("无文件、坏 JSON、platforms 非数组、platformCount 缺失 → 空台账且不 throw", () => {
    const dir = path.join(os.tmpdir(), `igp-absent-${process.pid}`);
    mkdirSync(path.join(dir, "data"), { recursive: true });
    try {
      expect(readIgetokenPlatforms(dir)).toEqual(EMPTY_IGETOKEN_PLATFORMS);
      writeFileSync(path.join(dir, "data", "igetoken.json"), "{不是 json");
      expect(readIgetokenPlatforms(dir)).toEqual(EMPTY_IGETOKEN_PLATFORMS);
      writeFileSync(path.join(dir, "data", "igetoken.json"), JSON.stringify({ platforms: {} }));
      expect(readIgetokenPlatforms(dir)).toEqual(EMPTY_IGETOKEN_PLATFORMS);
      writeFileSync(path.join(dir, "data", "igetoken.json"), JSON.stringify({ platforms: [] }));
      expect(readIgetokenPlatforms(dir)).toEqual(EMPTY_IGETOKEN_PLATFORMS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("合法台账原样返回（含配额字段——类型层保留，页面层不渲染）", () => {
    const dir = path.join(os.tmpdir(), `igp-ok-${process.pid}`);
    mkdirSync(path.join(dir, "data"), { recursive: true });
    const doc = {
      source: "https://igetoken.com/models/",
      sourceName: "iGetoken 免费资源库",
      scopeNote: "共 1 个平台。",
      usageNote: "线索台账，非发布内容。",
      rightsNote: "版权归原作者。",
      evidence: "third-party-aggregator",
      fetchedAt: "2026-11-25T03:33:22.690Z",
      declaredCount: 1,
      platformCount: 1,
      platforms: [
        {
          slug: "demo",
          name: "Demo 平台",
          category: "domestic",
          url: "https://igetoken.com/models/demo/",
          summary: "摘要",
          quota: "额度口径",
          tags: ["免费档"],
          checkedAt: "09/01 已核实",
          rating: "4",
        },
      ],
      sourceFingerprint: "0dcac586f201b03b",
    };
    try {
      writeFileSync(path.join(dir, "data", "igetoken.json"), JSON.stringify(doc));
      expect(readIgetokenPlatforms(dir)).toMatchObject({ platformCount: 1, platforms: [{ slug: "demo" }] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("真实台账（crawl-igetoken 每周覆盖）：只钉结构不变量，不钉快照值", () => {
  it("条数对账、身份键唯一、四项公开字段齐全、出处同域", () => {
    const ledger = readIgetokenPlatforms();
    if (!ledger.platforms.length) return; // 首份台账入库前允许空（缺席分支上一条已覆盖）
    expect(ledger.platformCount).toBe(ledger.platforms.length);
    // 出处页自述「共 N 个平台」与解析条数必须相等：不等就是漏卡，页面会把缺口静默展示出去
    expect(ledger.declaredCount).toBe(ledger.platformCount);
    expect(ledger.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(new Set(ledger.platforms.map((p) => p.slug)).size).toBe(ledger.platformCount);
    for (const p of ledger.platforms) {
      expect(p.name, p.slug).toBeTruthy();
      expect(p.category, p.slug).toBeTruthy();
      expect(p.checkedAt, p.slug).toMatch(/已核实$/);
      expect(p.url, p.slug).toMatch(/^https:\/\/igetoken\.com\/models\/[a-z0-9-]+\/$/);
    }
    // 红线②落在产物里：usageNote 必须在，且明确「非发布内容」
    expect(ledger.usageNote).toContain("非发布内容");
  });
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractDataJson } from "../crawler/extract.mjs";

const src = readFileSync(path.resolve(process.cwd(), "tests/fixtures/upstream-data.json"), "utf8");
/* 取不到条目就抛错：宁可红一条用例，也不要 `undefined.xxx` 的真因被埋进堆栈里 */
const item = (name: string) => {
  const found = extractDataJson(src).items.find((i) => i.name === name);
  if (!found) throw new Error(`fixture 缺条目：${name}`);
  return found;
};

describe("extract：上游 data.json 只解析、不改内容", () => {
  it("快照身份钉死：26377 字节 / sha16 0276a024c4f6e10e（换代必须显式改断言）", () => {
    expect(Buffer.byteLength(src)).toBe(26377);
    expect(createHash("sha256").update(src).digest("hex").slice(0, 16)).toBe("0276a024c4f6e10e");
  });

  it("出参只有 items 一个键：上游 retired / site / total 一律不出这道门（决策 Q4 的结构保证）", () => {
    const out = extractDataJson(src);
    expect(Object.keys(out)).toEqual(["items"]);
    expect(out.items).toHaveLength(36);
  });

  it("本层零过滤：sponsored 三条原样带出（挡架属 adapt 层，不在此处）", () => {
    expect(
      extractDataJson(src)
        .items.filter((i) => i.sponsored === true)
        .map((i) => i.name)
        .sort()
    ).toEqual(["腾讯云服务器", "蓝博科技（lanbuff）", "豆包拉新项目"]); // 码点升序，与 adapt.test 例② 同口径
  });

  it("字段保真（WorkBuddy 样本：推广短链未清洗、日期为上游原值）", () => {
    expect(item("WorkBuddy").category).toBe("tool");
    expect(item("WorkBuddy").entry_url).toBe("https://curl.qcloud.com/8dvDMEyi"); // 未清洗的原值
    expect(item("WorkBuddy").sponsored).toBe(false);
    expect(item("WorkBuddy").last_verified).toBe("2026-09-28");
    expect(item("WorkBuddy").validity).toBe("2026-10-10");
  });

  it("entry_url 与 intel_url 并存时两条都原样出参（取哪条由 adapt 定，实测 36 条里 35 条并存）", () => {
    expect(item("ZCode").entry_url).toBe("https://zcode.z.ai/cn");
    expect(item("ZCode").intel_url).toBe("https://bigmodel.cn/activity/trial-card/PU9MTWG0PM");
    expect(extractDataJson(src).items.filter((i) => i.entry_url && i.intel_url)).toHaveLength(35);
  });

  it("非 JSON 文本 → 抛「data.json 解析失败」，绝不返回空结构", () => {
    expect(() => extractDataJson("const TOKENS = [];")).toThrow(/data\.json 解析失败/);
  });

  it("形态异常全部 fail-stop：顶层非对象 / items 缺失或为空（防「上游清空」误判抹站）", () => {
    expect(() => extractDataJson("[]")).toThrow(/顶层不是对象/);
    expect(() => extractDataJson("null")).toThrow(/顶层不是对象/);
    expect(() => extractDataJson('{"site":"x"}')).toThrow(/items 缺失或为空/);
    expect(() => extractDataJson('{"items":[]}')).toThrow(/items 缺失或为空/);
  });
});

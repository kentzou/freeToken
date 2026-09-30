import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeBase64Utf8, dump, encodeBase64Utf8 } from "../crawler/serialize.mjs";

/** 工作树可能是 CRLF（本机实测 core.autocrlf=true，data/meta.json 是 w/crlf），
 *  而 dump 恒发 LF：比对前先归一——要钉的是「内容就是 dump 形态」，不是行尾。 */
const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("dump：全站唯一序列化出口", () => {
  it("2 空格缩进 + 结尾换行 + 键序即入参键序", () => {
    expect(dump({ b: 1, a: [1, 2] })).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}\n');
  });

  it("真实 data/ 三件套 parse→dump 后字节不变（后台写回不产生格式漂移的前提）", () => {
    for (const rel of ["data/tokens.json", "data/donots.json", "data/rules.json"]) {
      const text = lf(readFileSync(rel, "utf8"));
      expect(dump(JSON.parse(text))).toBe(text);
    }
  });

  it("config/site-config.json 已归一到 dump 形态（后台保存只改被编辑的那几行）", () => {
    const text = lf(readFileSync("config/site-config.json", "utf8"));
    expect(dump(JSON.parse(text))).toBe(text);
  });
});

describe("UTF-8 base64（Contents API 的 content 字段口径）", () => {
  it("中文往返一致：btoa/atob 只吃 latin1，必须先过 TextEncoder", () => {
    const s = '{"name":"阶跃星辰 StepFun","note":"额度以官网为准"}\n';
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });

  it("解码吃折行：GitHub 历史上每 76 列折一次，现口径不折——两种都要能读", () => {
    const one = encodeBase64Utf8("中文");
    expect(decodeBase64Utf8(one.replace(/(.{4})/g, "$1\n"))).toBe("中文");
  });

  it("300KB 文本不炸调用栈（分块 fromCharCode，绝不一次性展开实参）", () => {
    const big = "字".repeat(100_000);
    expect(decodeBase64Utf8(encodeBase64Utf8(big))).toBe(big);
  });
});

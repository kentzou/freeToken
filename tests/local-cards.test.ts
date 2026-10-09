/** 本地增补卡数据面（计划 6）。测试输入是合成的：它们只活在内存与被 mock 的文本里，
 *  绝不进 config/local-cards.json、绝不进 data/（用户规则：验收不许用假数据——
 *  这里当被测输入的是「机制」，不是交付给读者的情报）。 */
import { describe, expect, it } from "vitest";
import { FACT_FIELDS } from "../crawler/adapt.mjs";
import { LOCAL_TYPE_VALUES, loadLocalCards, normalizeLocalCard } from "../crawler/local-cards.mjs";
/* 静态导入而非 require：本仓测试是 ESM + vitest(node 环境)，require 在 .ts 里既过不了
   TS 检查也不会在运行时生效。tests/admin-type.test.ts 早已静态导入同一模块，node 环境可解析。 */
import { TYPE_VALUES } from "@/lib/admin/config";

/** 一条最小合法条目：必填四键齐、其余走缺省 */
const minimal = { name: "探针A", type: "工具", updated: "2026-10-09", link: "https://example.com/a" };

describe("loadLocalCards / normalizeLocalCard：本地增补卡的解析与归一化", () => {
  it("① 空文本·null·纯空白都视为空表（缺文件不是错误，spec §6.2）", () => {
    expect(loadLocalCards("")).toEqual([]);
    expect(loadLocalCards(null as any)).toEqual([]);
    expect(loadLocalCards("   \n  ")).toEqual([]);
  });

  it("② JSON 语法错要抛错并附文本指纹，绝不静默当空表（与 spec §2.3 的『静默消失』相反）", () => {
    expect(() => loadLocalCards("{oops")).toThrow(/local-cards\.json 解析失败/);
    // 指纹＝原文 sha256 前 16 位（16 位十六进制），让报错在日志里可反查是哪一份文本坏掉。
    // 逐字锚「解析失败」＋「[sha256:」两段，别写花哨字符集——上一版这里手误写成
    // /[sha256:）|（|]/ 这种把中文括号当字符类的正则，它匹配的是「sha256:」后跟 ）|（ 之一，
    // 而真实消息是 `[sha256:<16位hex>]`，正则恒不匹配 ⇒ 用例恒红，或更糟：被改成宽松的 .* 后失去牙。
    expect(() => loadLocalCards("{oops")).toThrow(/config\/local-cards\.json 解析失败.*\[sha256:[0-9a-f]{16}\]/);
    expect(() => loadLocalCards("{}")).toThrow(/顶层必须是数组.*\[sha256:[0-9a-f]{16}\]/);
  });

  it("③ 顶层不是数组当场抛（一个对象、null、字符串都不算『没有卡』）", () => {
    expect(() => loadLocalCards("{}")).toThrow(/顶层必须是数组/);
    expect(() => loadLocalCards("null")).toThrow(/顶层必须是数组/);
    expect(() => loadLocalCards('"本地卡"')).toThrow(/顶层必须是数组/);
  });

  it("④ 必填四键缺一即抛，错误消息点名 local-cards#下标（名称）——对齐 crawler/validate.mjs 的点名风格", () => {
    /* 逐键的期望前缀不一样：删掉 name 后条目「无名」，label 走的是无名分支（实现里 named 要 name 是非空字符串），
       此时消息是 local-cards#3（无名）而不是（探针A）。原先四键共用一条（探针A）正则，
       在 k="name" 那一轮恒不匹配——断言会红，而且红的原因看起来像「实现写错了」，实际是测试自己写歪了。 */
    for (const k of ["name", "type", "updated", "link"]) {
      const bad: any = { ...minimal };
      delete bad[k];
      const who = k === "name" ? "无名" : "探针A";
      expect(() => normalizeLocalCard(bad, 3)).toThrow(new RegExp(`local-cards#3（${who}）.*${k}`));
    }
    expect(() => normalizeLocalCard({ ...minimal, name: "  " }, 0)).toThrow(/local-cards#0（无名）.*缺必填字段 name/);
  });

  it("⑤ link 与 sourceUrl 必须 https:// 开头——linkRisk 对空串和裸域名都返回 null，这一关只能自己把（spec 复核记 8）", () => {
    /* 空串走的是必填闸而非协议闸：REQUIRED_KEYS 的 !card[k].trim() 先命中，
       抛「缺必填字段 link」。这里按实现的实际归属断言，不为了凑一句 /link 必须是 https/ 
       去把空串改成空格或别的形态——两条闸都各有用例覆盖才是完整的。 */
    expect(() => normalizeLocalCard({ ...minimal, link: "" }, 0)).toThrow(/缺必填字段 link/);
    expect(() => normalizeLocalCard({ ...minimal, link: "example.com/a" }, 0)).toThrow(/link 必须是 https/);
    expect(() => normalizeLocalCard({ ...minimal, link: "http://example.com/a" }, 0)).toThrow(/link 必须是 https/);
    expect(() => normalizeLocalCard({ ...minimal, sourceUrl: "example.com/a" }, 0)).toThrow(/sourceUrl 必须是 https/);
    expect(() => normalizeLocalCard({ ...minimal, sourceUrl: "" }, 0)).toThrow(/sourceUrl 必须是 https/);
  });

  it("⑥ updated/checkedAt：updated 必填且要 YYYY-MM-DD；checkedAt 给了就要合法", () => {
    expect(() => normalizeLocalCard({ ...minimal, updated: "2026-10-9" }, 0)).toThrow(/updated 必须是 YYYY-MM-DD/);
    expect(() => normalizeLocalCard({ ...minimal, updated: "2026-10-09 12:00" }, 0)).toThrow(/updated 必须是 YYYY-MM-DD/);
    /* 计划原文此处分输入为 "2026-10-09"，那是合法的 YYYY-MM-DD、实现按 spec 正确放行，
       「to throw」恒不成立（实测 8 passed | 1 failed）。已核实属计划笔误：本行意图是
       「checkedAt 给了就要合法」，改喂非法日期（与上一行 updated 的非法形态同源），断言强度不降。 */
    expect(() => normalizeLocalCard({ ...minimal, checkedAt: "2026-10-9" }, 0)).toThrow(/checkedAt 必须是 YYYY-MM-DD/);
    expect(normalizeLocalCard({ ...minimal, checkedAt: "2026-10-08" }, 0).checkedAt).toBe("2026-10-08");
  });

  it("⑦ type 只认三档，且与 src/lib/admin/config.ts 的 TYPE_VALUES 逐字同集（跨语言单源对账）", () => {
    expect(() => normalizeLocalCard({ ...minimal, type: "合作情报" }, 0)).toThrow(/type=合作情报/);
    expect(() => normalizeLocalCard({ ...minimal, type: "tool" }, 0)).toThrow(/type=tool/);
    expect([...LOCAL_TYPE_VALUES].sort()).toEqual([...TYPE_VALUES].sort());
  });

  it("⑧ 未知字段点名拒绝（hide 该写 site-config、码池与 poster 一律不入本地卡）", () => {
    expect(() => normalizeLocalCard({ ...minimal, hide: true }, 0)).toThrow(/未知字段 hide/);
    expect(() => normalizeLocalCard({ ...minimal, inviteCodes: ["x"] }, 0)).toThrow(/未知字段 inviteCodes/);
    expect(() => normalizeLocalCard({ ...minimal, ratg: 5, psotr: "p" }, 0)).toThrow(/未知字段 ratg, psotr/);
  });

  it("⑨ 键序固定＝事实 7 键 → 观点键（按 FACT_FIELDS 同源顺序）→ origin/sourceUrl/checkedAt；同输入连跑两次逐字节相同", () => {
    const card = normalizeLocalCard(
      { ...minimal, v2: true, rating: 5, effect: "写代码很快", quota: "每日 200 次", modality: "Probe-1" },
      0
    );
    expect(Object.keys(card)).toEqual([
      ...FACT_FIELDS,
      "rating",
      "effect",
      "v2",
      "origin",
      "sourceUrl",
      "checkedAt",
    ]);
    expect(card.origin).toBe("local");
    expect(card.sourceUrl).toBe("https://example.com/a"); // 缺省取 link
    expect(card.checkedAt).toBe("2026-10-09"); // 缺省取 updated
    expect(card.limited).toBeNull();
    const again = normalizeLocalCard(card, 0); // 幂等：归一化结果再归一化必须一模一样
    expect(JSON.stringify(again)).toBe(JSON.stringify(card));
  });
});

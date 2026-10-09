/** 本地增补卡数据面（计划 6）。测试输入是合成的：它们只活在内存与被 mock 的文本里，
 *  绝不进 config/local-cards.json、绝不进 data/（用户规则：验收不许用假数据——
 *  这里当被测输入的是「机制」，不是交付给读者的情报）。 */
import { describe, expect, it } from "vitest";
import { FACT_FIELDS } from "../crawler/adapt.mjs";
import { LOCAL_TYPE_VALUES, loadLocalCards, mergeLocalCards, normalizeLocalCard, reconcileLocalCards } from "../crawler/local-cards.mjs";
/* 静态导入而非 require：本仓测试是 ESM + vitest(node 环境)，require 在 .ts 里既过不了
   TS 检查也不会在运行时生效。tests/admin-type.test.ts 早已静态导入同一模块，node 环境可解析。 */
import { TYPE_VALUES } from "@/lib/admin/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ADD_CARD_NOTE } from "@/lib/admin/uiModel";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

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
    /* 本行 checkedAt 的字面量刻意写成斜杠分隔日期（见下行字符串，分隔符是斜杠而非连字符）：
       DATE_RE 只认连字符形态的 YYYY-MM-DD，所以这条输入必定抛错，断言因此有牙。
       ⚠ 本环境的读文件与终端显示层会把斜杠渲染成连字符，屏幕读数不作证据：改动本行必须按字节校验，
       落地后该行应出现 54,47,49,48,47,48,57（即 2026/10/09）——这是上一轮转写踩过的坑。 */
    expect(() => normalizeLocalCard({ ...minimal, checkedAt: "2026/10/09" }, 0)).toThrow(/checkedAt 必须是 YYYY-MM-DD/);
    expect(normalizeLocalCard({ ...minimal, checkedAt: "2026-10-08" }, 0).checkedAt).toBe("2026-10-08");
  });

  it("⑦ type 只认三档，且与 src/lib/admin/config.ts 的 TYPE_VALUES 逐字同集（跨语言单源对账）", () => {
    expect(() => normalizeLocalCard({ ...minimal, type: "合作情报" }, 0)).toThrow(/type=合作情报/);
    expect(() => normalizeLocalCard({ ...minimal, type: "tool" }, 0)).toThrow(/type=tool/);
    expect([...LOCAL_TYPE_VALUES].sort()).toEqual([...TYPE_VALUES].sort());
  });

  it("⑧ 未知字段点名拒绝（hide 该写 site-config、码池与 poster 一律不入本地卡）＋事实键写了就要是字符串", () => {
    expect(() => normalizeLocalCard({ ...minimal, hide: true }, 0)).toThrow(/未知字段 hide/);
    expect(() => normalizeLocalCard({ ...minimal, inviteCodes: ["x"] }, 0)).toThrow(/未知字段 inviteCodes/);
    expect(() => normalizeLocalCard({ ...minimal, ratg: 5, psotr: "p" }, 0)).toThrow(/未知字段 ratg, psotr/);
    // R-3：类型不对的事实键不许被静默清成空串（手抄来源页最常把额度写成数字）
    expect(() => normalizeLocalCard({ ...minimal, quota: 200000 }, 0)).toThrow(/字段 quota 必须是字符串/);
    expect(() => normalizeLocalCard({ ...minimal, modality: ["chat"] }, 0)).toThrow(/字段 modality 必须是字符串/);
    expect(() => normalizeLocalCard({ ...minimal, limited: 123 }, 0)).toThrow(/字段 limited 只能是字符串或 null/);
  });

  it("⑨ 键序固定＝事实 7 键 → 观点键（按 VIEW_KEYS 顺序）→ origin/sourceUrl/checkedAt；同输入连跑两次逐字节相同", () => {
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

describe("mergeLocalCards：同名一律上游胜出（spec 裁决 #8）", () => {
  const up = (name: string, quota: string) => ({
    name,
    type: "工具",
    modality: "",
    quota,
    link: `https://up.example/${name}`,
    limited: null,
    updated: "2026-01-01",
  });
  const loc = (name: string) => ({
    name,
    type: "大模型",
    updated: "2026-10-09",
    link: `https://mine.example/${name}`,
    sourceUrl: `https://mine.example/${name}#pricing`,
  });

  it("⑩ 与上游同名 → 上游对象原样留在原位，本地条目跳过并进 warn", () => {
    const upstream = [up("A", "上游额度"), up("B", "上游额度")];
    const { cards, warn } = mergeLocalCards(upstream, [loc("B"), loc("C")]);
    expect(warn).toEqual(["B"]);
    expect(cards.map((c: any) => c.name)).toEqual(["A", "B", "C"]);
    // 赢的那张必须是上游对象本身：quota 与 updated 都走上游值，观点字段也没被本地覆盖
    expect(cards[1]).toBe(upstream[1]);
    expect(cards[1].quota).toBe("上游额度");
    expect(cards[1].updated).toBe("2026-01-01");
    // 「原样」还要钉住形态：上游卡不许被顺手归一化——归一化会补 origin/sourceUrl/checkedAt，
    // 键数一变就不再是上游那张对象的内容了（引用相等拦不住这种就地改写）
    expect(Object.keys(cards[1])).toHaveLength(7);
    // 追加的那张必须已归一化（不是文件里的裸对象）：origin/sourceUrl/checkedAt 齐、事实键序在前
    expect(Object.keys(cards[2]).slice(-3)).toEqual(["origin", "sourceUrl", "checkedAt"]);
    expect(cards[2].sourceUrl).toBe("https://mine.example/C#pricing");
  });

  it("⑪ 本地表内部同名不靠文件顺序侥幸：后一条同样被前面的本地条目挡住并进 warn", () => {
    const { cards, warn } = mergeLocalCards([], [loc("D"), { ...loc("D"), updated: "2026-10-10" }]);
    expect(cards).toHaveLength(1);
    expect(warn).toEqual(["D"]);
    // 留下的必须是**前一条**（文件序）：last-wins 实现同样得「长度 1 ＋ warn ["D"]」，只有内容能分辨
    expect(cards[0].updated).toBe("2026-10-09");
  });

  it("⑫ 空本地表 → 产物与上游逐字相同、warn 为空；两个容器传 null 也不抛", () => {
    const upstream = [up("A", "x"), up("B", "y")];
    const merged = mergeLocalCards(upstream, []);
    expect(merged.cards).toEqual(upstream);
    expect(merged.warn).toEqual([]);
    expect(merged.cards).not.toBe(upstream); // 不改动调用方数组（管线里 cleaned 还要被别处引用）
    expect(mergeLocalCards(null as any, null as any)).toEqual({ cards: [], warn: [] });
  });
});

describe("reconcileLocalCards：产物与 config/local-cards.json 的来源对账（spec §8）", () => {
  const localNames = ["探针A"];
  const good = {
    name: "探针A",
    type: "工具",
    modality: "",
    quota: "",
    link: "https://example.com/a",
    limited: null,
    updated: "2026-10-09",
    origin: "local",
    sourceUrl: "https://example.com/a#pricing",
    checkedAt: "2026-10-09",
  };

  it("⑬ 干净形态零违规（本地卡与非本地卡混排都算对）", () => {
    expect(reconcileLocalCards([good, { name: "上游卡", type: "工具", updated: "2026-01-01" }], localNames)).toEqual([]);
    expect(reconcileLocalCards([], [])).toEqual([]);
    expect(reconcileLocalCards(null as any, null as any)).toEqual([]);
  });

  it("⑭ 产物里贴了 origin=local 却在 config 里没登记 → 违规（手工贴标＝出处造假）", () => {
    const bad = { ...good, name: "没登记的卡" };
    const out = reconcileLocalCards([bad], localNames);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("没登记的卡");
    expect(out[0]).toMatch(/config\/local-cards\.json 里没有这条/);
  });

  it("⑮ 标了 local 却没带 https 出处或核验日不可解析 → 违规（读者无从指认额度原文）", () => {
    expect(reconcileLocalCards([{ ...good, sourceUrl: undefined } as any], localNames)[0]).toMatch(/sourceUrl/);
    expect(reconcileLocalCards([{ ...good, sourceUrl: "example.com/a" }], localNames)[0]).toMatch(/sourceUrl/);
    expect(reconcileLocalCards([{ ...good, checkedAt: "", updated: "" }], localNames)[0]).toMatch(/核验日/);
  });

  it("⑯ origin 只认 local；非 local 的 origin 值一律违规（防止出现第二套来源语义）", () => {
    expect(reconcileLocalCards([{ ...good, origin: "upstream" }], localNames)[0]).toMatch(/origin="local" 之外的值/);
    expect(reconcileLocalCards([{ ...good, origin: null }], localNames)[0]).toMatch(/origin="local" 之外的值/);
  });
});

describe("公开口径：本地增补卡的核验日与新增卡路径", () => {
  it("⑰ 「精选门槛与收录标准」页公示了本地增补卡的核验日来自本站（spec §6.4）", () => {
    const page = read("src/app/editorial-policy/page.tsx");
    expect(page).toContain("每条情报的核验日期来自上游更新时间，本站不擅自改写。"); // 上游口径不许被顺手改掉
    expect(page).toContain("本地增补卡");
    expect(page).toMatch(/config\/local-cards\.json/);
  });

  it("⑱ 后台的新增卡说明改指 config/local-cards.json，不再教人手工改 data/tokens.json", () => {
    expect(ADD_CARD_NOTE).toContain("config/local-cards.json");
    expect(ADD_CARD_NOTE).not.toContain("手工改 data/tokens.json");
    // 「库里没有的卡名保存成功却不出现」这条既有事实必须留着——它仍是 hide 之外的真约束
    expect(ADD_CARD_NOTE).toContain("保存成功但页面上不出现");
  });
});

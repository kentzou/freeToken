/** 计划 5 §3 D2：用户裁决放开的字段在仓内实际叫 type（首页「合作情报」由 catOf 判 card.type 派生）。
 *  三条用例按真实链路各挡一段：消费方（applySiteConfig）、写入侧（PATCH_KEYS/校验）、派生侧（splitByCategory）。
 *  只测其中一段会留下「白名单放了、消费方没接」的半截实现——那正是裁决禁止的「写了不生效」。 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySiteConfig } from "../crawler/clean.mjs";
import { catOf, splitByCategory } from "@/lib/catalog";
import { PATCH_KEYS, configRows, patchSiteConfig, validateConfigShape } from "@/lib/admin/config";
import type { TokenCard } from "@/lib/types";

const cards = JSON.parse(readFileSync("data/tokens.json", "utf8"));
const donots = JSON.parse(readFileSync("data/donots.json", "utf8"));
/** 自锚取数（计划 3 §7 第 20 条：钉真实数据的用例不许硬编码条数） */
const target = cards.find((c: any) => catOf(c) === "大模型");

describe("type 覆盖：从写入侧到消费方一条链", () => {
  it("PATCH_KEYS 认 type，且 patchSiteConfig 把它落进逐卡覆盖", () => {
    expect(PATCH_KEYS).toContain("type");
    const next = patchSiteConfig({ cards: {} } as any, { cards: { [target.name]: { type: "项目" } } } as any);
    expect(next.cards![target.name]).toEqual({ type: "项目" }); // ! 只在类型层（patchSiteConfig 必回 cards）
  });

  it("applySiteConfig 真消费 type：覆盖后该卡换类，未覆盖的卡一条不动", () => {
    const out = applySiteConfig(cards, donots, { cards: { [target.name]: { type: "项目" } } });
    const moved = out.cards.find((c: any) => c.name === target.name)!; // ! 只在类型层，命中失败会抛 TypeError 让本例照样红
    expect(moved.type).toBe("项目");
    expect(out.cards).toHaveLength(cards.length); // 覆盖不改条数
  });

  it("覆盖层活过数据重写：爬取重刷 data/tokens.json 后，同一份 config 仍把它算进合作情报", () => {
    // 「每日爬取整体重写受版数据」是裁决②要求回答的持久性冲突；答案＝冲突不存在，因为覆盖在 config 层。
    const crawled = JSON.parse(readFileSync("data/tokens.json", "utf8")); // 同输入→同产物，重写不会带上后台的 type
    expect(catOf(crawled.find((c: any) => c.name === target.name))).toBe("大模型");
    const applied = applySiteConfig(crawled, donots, { cards: { [target.name]: { type: "项目" } } });
    // as TokenCard[] 只在类型层：clean.mjs 的声明用索引签名放行（TokenCardLike），受版卡本身就是 TokenCard 形态
    expect(splitByCategory(applied.cards as TokenCard[]).partners.map((c: any) => c.name)).toContain(target.name);
  });

  it("非法取值在校验侧就拒：type 只认三档，写错不许显示已保存", () => {
    expect(validateConfigShape({ cards: { A: { type: "合作" } } } as any)).toEqual([
      '卡「A」的 type 必须是 大模型/工具/项目，当前「合作」',
    ]);
    expect(validateConfigShape({ cards: { A: { type: "项目" } } } as any)).toEqual([]);
  });

  it("configRows 暴露 category（现值）与 type（覆盖值）两列，UI 不许自己再算一遍", () => {
    const cfg = { cards: { [target.name]: { type: "项目" } } } as any;
    const row = configRows(cfg, { [target.name]: "大模型" }).find((r) => r.name === target.name)!;
    expect(row.category).toBe("大模型"); // 现值：这张卡在受版数据里仍挂「大模型」
    expect(row.type).toBe("项目"); // 覆盖值：站长在后台把它改成了「项目」
    expect(configRows(cfg).length).toBe(configRows(cfg, {}).length); // 不传现值表也不炸（HEAD 的既有调用点 configRows(base) 是单参）
    expect(configRows(cfg)[0].category).toBe(""); // 空串＝「本行没有现值依据」，UI 必须显示「—」而不是猜一个大模型
  });
});

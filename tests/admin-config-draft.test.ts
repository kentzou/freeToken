/** 换算层管的是「点了保存，到底要把哪些键写进 config」。
 *  这条链最坏的失败不是崩，而是静默：漏一个键＝界面显示已保存、线上没变化（§7-16 明令禁止的形态）。
 *  基线数据取仓库真文件，不手搓 config——真加一张卡或改了键序，这里先红而不是继续骗人。 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configRows, patchSiteConfig, validateConfigShape } from "@/lib/admin/config";
import { buildPatch, draftFrom, hasPatch } from "@/lib/admin/configDraft";
import type { DraftItem } from "@/lib/admin/configDraft";
import type { SiteConfig } from "@/lib/types";

const cfg = JSON.parse(readFileSync("config/site-config.json", "utf8")) as SiteConfig;
const names = Object.keys(cfg.cards ?? {});
const rows = configRows(cfg);
const draft0 = draftFrom({ wechatId: cfg.wechatId ?? "", adminLoginsText: (cfg.adminLogins ?? []).join(", ") }, rows);

describe("configDraft：只把改动写进 patch", () => {
  it("原样回填＝空 patch（保存按钮此时必须禁用）", () => {
    const p = buildPatch(draft0, rows);
    expect(hasPatch(p)).toBe(false);
    expect(p.cards ?? {}).toEqual({});
  });
  it("改一张卡的邀请码：patch 里只有这一张、只有这一个键", () => {
    const d = { ...draft0, cards: { ...draft0.cards, [names[0]]: { ...draft0.cards[names[0]], inviteCodes: "AAA, BBB" } } };
    const p = buildPatch(d, rows);
    expect(Object.keys(p.cards ?? {})).toEqual([names[0]]);
    expect(p.cards![names[0]]).toEqual({ inviteCodes: ["AAA", "BBB"] });
  });
  /** 执行期 D11 校正（Task 9 实现者 BLOCKED 上报，主控复现取证后改正文；原写作只清 link、
   *  末行 `not.toHaveProperty("link")`——那条断言在现库数据上不可满足，见下）。
   *  这一例要证的分支是 config.ts:44 的 `delete cur[k]`（删掉一个键、**条目还在**），
   *  而下一例要证的是 :47 的 `delete cards[name]`（整条删卡）。两者必须分开，否则 :44 无人覆盖。
   *  原写法为什么撞不到 :44：实测 `config/site-config.json` 的 11 张卡里，10 张的覆盖只有
   *  `{link}` 一个键、1 张（豆包拉新项目）只有 `{hide}`，**没有任何一张卡带两个覆盖键**；
   *  于是「只清 link」直接走满清空路径，条目变 undefined，`not.toHaveProperty` 在 undefined 上
   *  抛 `Cannot convert undefined or null to object`（vitest 实测：tests 里唯一一条红就是它）。
   *  补法＝同一张卡上再压一个 `type` 覆盖，让条目在 link 被删后仍然活着。 */
  it("清空一个覆盖键＝delete 语义（键删掉、条目还在；全部键清空才整条删，见下一例）", () => {
    const withLink = rows.find((r) => r.link !== "");
    expect(withLink).toBeTruthy(); // 现库确有 link 覆盖：没有这条事实，本用例就该改写而不是假绿
    const d = {
      ...draft0,
      cards: { ...draft0.cards, [withLink!.name]: { ...draft0.cards[withLink!.name], link: "", type: "工具" } },
    };
    const p = buildPatch(d, rows);
    expect(p.cards![withLink!.name]).toEqual({ link: "", type: "工具" }); // 空串照递、不在这层删——删除语义归 patchSiteConfig
    const after = (patchSiteConfig(cfg, p).cards as Record<string, unknown>)[withLink!.name];
    expect(after).not.toHaveProperty("link");
    expect(after).toEqual({ type: "工具" }); // 兄弟键活着，才证明 :44 是「删键」而不是「删卡」
  });
  it("全部覆盖清空＝整条卡删除，不留空壳", () => {
    const one = rows.find((r) => r.overridden)!;
    /** 执行期 D4 校正：原写作 `const blank: Record<string, unknown> = {}` 再 `for (const k of PATCH_KEYS) blank[k] = …`，
     *  两处都不成立——① `draft0.cards` 是 `Record<string, DraftItem>`，灌进 `Record<string, unknown>` 实测 TS2345，tsc 门禁必红；
     *  ② PATCH_KEYS 里的隐藏键名是 `hide`（config.ts:12），DraftItem 里的字段名是 `hidden`，那个循环永远匹配不到 `k === "hidden"`，
     *  只会给 `hide` 写出空串——类型不对、语义也不「清空」。逐字段字面量才是这张卡的空白态。 */
    const blank: DraftItem = { link: "", inviteBase: "", inviteCodes: "", inviteParam: "", type: "", hidden: false };
    const d = { ...draft0, cards: { ...draft0.cards, [one.name]: blank } };
    const next = patchSiteConfig(cfg, buildPatch(d, rows));
    expect((next.cards as Record<string, unknown>)[one.name]).toBeUndefined();
  });
  it("type 三档可覆盖，空串＝不覆盖；写进去的值必须能被 validateConfigShape 吃下", () => {
    const d = { ...draft0, cards: { ...draft0.cards, [names[1]]: { ...draft0.cards[names[1]], type: "工具" } } };
    const p = buildPatch(d, rows);
    expect(p.cards![names[1]]).toEqual({ type: "工具" });
    expect(validateConfigShape(patchSiteConfig(cfg, p))).toEqual([]);
  });
  it("hide 翻转进 patch，且与「仅隐藏」行的其它键互不污染", () => {
    const only = rows.find((r) => r.hidden && !r.overridden) ?? rows[0];
    const d = { ...draft0, cards: { ...draft0.cards, [only.name]: { ...draft0.cards[only.name], hidden: !only.hidden } } };
    expect(buildPatch(d, rows).cards![only.name]).toEqual({ hide: !only.hidden });
  });
  it("微信号与名单各占一键，未改的不出现在 patch 里", () => {
    const d = { ...draft0, wechatId: "  newid  ", adminLoginsText: draft0.adminLoginsText };
    const p = buildPatch(d, rows);
    expect(p.wechatId).toBe("  newid  "); // 去空白是 patchSiteConfig 的事，换算层不提前 trim（免得两边口径不同）
    expect(p.adminLoginsText).toBeUndefined();
  });
  it("名单一行输入 → parseLogins 口径：半角逗号、全角逗号、空格与制表混排都算分隔（不含顿号，见 D8）", () => {
    const d = { ...draft0, adminLoginsText: "hope0719，a b\tc" };
    const next = patchSiteConfig(cfg, buildPatch(d, rows));
    expect(next.adminLogins).toEqual(["hope0719", "a", "b", "c"]);
  });
  it("行序＝配置文件键序，草稿不新增行（新增卡不在这里做，见 ADD_CARD_NOTE）", () => {
    expect(rows.map((r) => r.name)).toEqual(names);
    expect(Object.keys(draft0.cards)).toEqual(names);
  });
});

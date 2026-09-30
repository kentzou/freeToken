import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySiteConfig } from "../crawler/clean.mjs";
import { decodeBase64Utf8, dump, encodeBase64Utf8 } from "../crawler/serialize.mjs";
import { CONFIG_PATH, configPayloadPreview, configRows, loadSiteConfig, patchSiteConfig, saveSiteConfig, validateConfigShape } from "@/lib/admin/config";
import { jsonOf, mkFetch, res } from "./helpers/fake-fetch";
import { realData } from "./helpers/pending";

const base: any = JSON.parse(readFileSync("config/site-config.json", "utf8"));
// 远端替身一律用 dump(base)（LF）而不是 readFileSync 的工作树文本：GitHub 存 LF，CRLF 会让「逐字比对再写」白白多写一次
const canon = dump(base);
const fileRes = (text: string, sha = "S-CFG") => res(200, { sha, encoding: "base64", content: encodeBase64Utf8(text), updated_at: "" });

describe("变现配置读写：写入侧比读取侧更严（未知键直接拒，不给静默忽略的机会）", () => {
  it("loadSiteConfig：URL 逐字、返回 sha 与原文，真配置就是 11 张卡 + 空名单", async () => {
    const f = mkFetch(fileRes(canon));
    const got = await loadSiteConfig({ repo: "o/r", token: "ghu_x", fetchImpl: f.fn });
    expect(f.calls[0].url).toBe(`https://api.github.com/repos/o/r/contents/${CONFIG_PATH}`);
    expect(got.sha).toBe("S-CFG");
    expect(got.text).toBe(canon);
    expect(Object.keys(got.config.cards ?? {})).toHaveLength(11);
    expect(got.config.adminLogins).toEqual([]);
    expect(got.config.githubRepo).toBe("");
  });

  it("patchSiteConfig：三个顶层键 trim 后写入，未传的键原样保留，入参不被改", () => {
    const before = dump(base);
    const next = patchSiteConfig(base, { wechatId: "  hope0719  ", githubRepo: " hope0719/token-fbi-next ", oauthClientId: "Iv1.abc" });
    expect(next.wechatId).toBe("hope0719");
    expect(next.githubRepo).toBe("hope0719/token-fbi-next");
    expect(next.oauthClientId).toBe("Iv1.abc");
    expect(next.partners).toBe(null);
    expect(Object.keys(next)).toEqual(["wechatId", "adminLogins", "oauthClientId", "githubRepo", "partners", "cards"]);
    expect(dump(base)).toBe(before);
  });

  it("逐卡覆盖：hide 可开可关，清空后整条覆盖删除（不留 {} 空壳）", () => {
    const hidden = patchSiteConfig(base, { cards: { "小米 MiMo（Xiaomi）": { hide: false } } });
    expect(hidden.cards!["小米 MiMo（Xiaomi）"]).toEqual({ hide: false });
    const added = patchSiteConfig(base, { cards: { WorkBuddy: { link: "https://example.com/go", inviteCodes: ["c1", "c2"] } } });
    expect(added.cards!.WorkBuddy).toEqual({ link: "https://example.com/go", inviteCodes: ["c1", "c2"] });
    const emptied = patchSiteConfig(added, { cards: { WorkBuddy: { link: "", inviteCodes: [] } } });
    expect(emptied.cards!.WorkBuddy).toBeUndefined();
  });

  it("未知键在写入侧就被拒（applySiteConfig 会静默忽略它，配置页却显示「已保存」＝自欺）", () => {
    expect(() => patchSiteConfig(base, { cards: { WorkBuddy: { promoText: "打折" } as never } })).toThrow("未知配置键：promoText");
    expect(validateConfigShape({ cards: { A: { hide: "yes" as never } } } as never)).toEqual(['卡「A」的 hide 必须是布尔']);
  });

  it("validateConfigShape：githubRepo 必须 owner/repo，adminLogins 不得含空白或斜杠", () => {
    expect(validateConfigShape({ githubRepo: "token-fbi-next" } as never)).toEqual(['githubRepo 需形如 owner/repo，当前「token-fbi-next」']);
    expect(validateConfigShape({ githubRepo: "o/r" } as never)).toEqual([]);
    expect(validateConfigShape({ adminLogins: ["hope0719", "bad name", ""] } as never)).toHaveLength(2);
  });

  it("adminLogins 走 parseLogins：全角逗号与换行都吃，顺序保留", () => {
    const next = patchSiteConfig(base, { adminLoginsText: "hope0719，second-user third" });
    expect(next.adminLogins).toEqual(["hope0719", "second-user", "third"]);
    expect(validateConfigShape(next)).toEqual([]);
  });

  it("saveSiteConfig：内容没变就一个字也不写", async () => {
    const f = mkFetch(res(200, {}));
    const out = await saveSiteConfig({ repo: "o/r", config: base, patch: { wechatId: "" }, message: "chore(cfg): 空改动", remote: { text: canon, sha: "S-CFG" }, fetchImpl: f.fn });
    expect(out).toEqual({ kind: "unchanged", sha: "S-CFG" });
    expect(f.calls.length).toBe(0);
  });

  it("saveSiteConfig：有变化才 PUT，payload 解码回来就是 dump 后的新配置，且真管线照吃", async () => {
    const { cards, donots } = realData();
    const f = mkFetch(res(200, { commit: { sha: "C1" }, content: { sha: "S2" } }));
    const patch = { wechatId: "hope0719", cards: { WorkBuddy: { hide: true } } };
    const out = await saveSiteConfig({ repo: "o/r", config: base, patch, message: "chore(cfg): 隐藏 WorkBuddy", remote: { text: canon, sha: "S-CFG" }, fetchImpl: f.fn });
    expect(out).toEqual({ kind: "committed", commitSha: "C1", contentSha: "S2" });
    const body = jsonOf(f.calls[0]);
    expect(body.sha).toBe("S-CFG");
    expect(body.branch).toBe("main");
    const written = decodeBase64Utf8(body.content);
    expect(written).toBe(dump(patchSiteConfig(base, patch)));
    // spec §3 的「commit payload 预览」与真 PUT 的内容必须逐字相同（同一个 dump(patchSiteConfig(...))），否则预览是第二套格式化、会自证清白
    expect(configPayloadPreview(base, patch)).toBe(written);
    // 写回去的配置必须被真 applySiteConfig 吃下：32 → 31，WorkBuddy 真的从卡表消失
    const applied = applySiteConfig(cards, donots, JSON.parse(written));
    expect(applied.cards).toHaveLength(31);
    expect(applied.cards.find((c: any) => c.name === "WorkBuddy")).toBeUndefined();
    /** 清池口径钉（crawler/clean.mjs 的「配 link 未配码池则清池」）：只存 inviteBase 不存 inviteCodes，
     *  管线会把 inviteBase 删掉。Tab2 若允许单独保存前缀，保存成功等于没生效——这条就是那口铃。 */
    const poolOnly = applySiteConfig(cards, donots, { cards: { WorkBuddy: { link: "https://hunyuan.tencent.com/", inviteBase: "https://example.com/inv?c=" } } });
    expect(poolOnly.cards.find((c: any) => c.name === "WorkBuddy")!.inviteBase).toBeUndefined(); // ! 只在类型层
    const poolFull = applySiteConfig(cards, donots, { cards: { WorkBuddy: { link: "https://hunyuan.tencent.com/", inviteBase: "https://example.com/inv?c=", inviteCodes: ["T1"] } } });
    const full = poolFull.cards.find((c: any) => c.name === "WorkBuddy")!; // ! 只在类型层，命中失败会抛 TypeError 让本例照样红
    expect(full.inviteBase).toBe("https://example.com/inv?c=");
    expect(full.inviteCodes).toEqual(["T1"]);
  });

  it("configRows：11 行、2 行隐藏、逐卡邀请码以逗号串回显（Tab2 的渲染事实）", () => {
    const rows = configRows(base);
    expect(rows.length).toBe(11);
    expect(rows.filter((r) => r.hidden).map((r) => r.name)).toEqual(["豆包拉新项目", "小米 MiMo（Xiaomi）"]);
    expect(rows.find((r) => r.name === "WorkBuddy")!.link).toBe("https://hunyuan.tencent.com/");
    expect(rows.find((r) => r.name === "豆包拉新项目")!.overridden).toBe(false);
  });
});

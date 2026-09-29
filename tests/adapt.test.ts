import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_TO_TYPE, FACT_FIELDS, NAME_ALIAS, adaptItem, adaptItems } from "../crawler/adapt.mjs";
import { injectUpstreamItem } from "./helpers/upstream";

const items = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "tests/fixtures/upstream-data.json"), "utf8")
).items as any[];
const find = (name: string) => items.find((i) => i.name === name);

describe("adapt：data.json item → 本站卡片（决策 Q1/Q2/Q6/Q7/Q9）", () => {
  it("① 类目映射只认 tool/model，event 与未知类目挡架", () => {
    expect(CATEGORY_TO_TYPE).toEqual({ tool: "工具", model: "大模型" });
    expect(adaptItem(find("WorkBuddy"))?.type).toBe("工具");
    expect(adaptItem(find("阶跃星辰 StepFun"))?.type).toBe("大模型");
    expect(adaptItem({ name: "活动卡", category: "event" })).toBeNull();
    expect(adaptItem({ name: "怪类目卡", category: "unknown" })).toBeNull();
    expect(adaptItem({ name: "无类目卡" })).toBeNull();
  });

  it("② sponsored===true 一律挡架（决策 Q6：广告位不进报纸），真实 fixture 恰好 3 条", () => {
    expect(items.filter((i) => i.sponsored === true).map((i) => i.name).sort()).toEqual(
      ["腾讯云服务器", "蓝博科技（lanbuff）", "豆包拉新项目"] // 码点升序：腾 817E < 蓝 84DD < 豆 8C46（勿按名字直觉改回）
    );
    for (const name of ["蓝博科技（lanbuff）", "腾讯云服务器"]) expect(adaptItem(find(name))).toBeNull();
    expect(adaptItems(items, []).map((c) => c.name)).not.toContain("蓝博科技（lanbuff）");
  });

  it("③ 事实字段映射：entry_url→link、validity→limited、last_verified→updated，quota/modality 逐字", () => {
    const f = adaptItem(find("WorkBuddy"))!;
    expect(f.link).toBe("https://curl.qcloud.com/8dvDMEyi"); // 未清洗原值，清洗是 clean.mjs 的事
    expect(f.limited).toBe("2026-10-10");
    expect(f.updated).toBe("2026-09-28");
    expect(f.quota).toBe("HY3 限免至 2026-09-30；HY4 preview 新用户首开对话起 14 天内免费。");
    expect(f.modality).toBe("HY3 · HY4 preview · DeepSeek-V4.1-Flash");
    expect(Object.keys(f)).toEqual(FACT_FIELDS);
  });

  it("④ 改名 alias：上游 Qoder cn → 本地「阿里云 Qoder（灵码）」，缺它则观点字段全丢", () => {
    expect(NAME_ALIAS).toEqual({ "Qoder cn": "阿里云 Qoder（灵码）" });
    expect(adaptItem(find("Qoder cn"))?.name).toBe("阿里云 Qoder（灵码）");
  });

  it("⑤ 分层合并：事实刷新、观点字段（rating/effect/signup/pin/badge/tone/extraAction/v2）保留", () => {
    const prev = {
      name: "WorkBuddy",
      type: "工具",
      modality: "旧 modality",
      rating: 5,
      quota: "旧额度文案",
      signup: "本地 signup",
      effect: "本地 effect",
      link: "https://old.example/",
      limited: "1970-01-01",
      updated: "2026-09-11",
      badge: "本地徽章",
      tone: "本地语气",
      extraAction: { text: "本地按钮", link: "https://btn.example/" },
      v2: true,
    };
    const [merged] = adaptItems([find("WorkBuddy")], [prev]);
    expect(merged.updated).toBe("2026-09-28"); // 事实层刷新
    expect(merged.quota).toBe("HY3 限免至 2026-09-30；HY4 preview 新用户首开对话起 14 天内免费。");
    expect(merged.modality).toBe("HY3 · HY4 preview · DeepSeek-V4.1-Flash");
    expect(merged.link).toBe("https://curl.qcloud.com/8dvDMEyi");
    expect(merged.limited).toBe("2026-10-10");
    for (const k of ["rating", "signup", "effect", "badge", "tone", "extraAction", "v2"]) {
      expect(merged[k]).toEqual(prev[k as keyof typeof prev]); // 观点层不动
    }
  });

  it("⑥ 本地独有卡上游没有 → 自动出局（决策 Q2 跟随下架），且不会被写进观望名单", () => {
    const prevCards = [
      { name: "WorkBuddy", type: "工具" },
      { name: "GLM-5.3-Flash（Ox-Alpha）", type: "大模型", rating: 4 },
      { name: "2026 微信小程序开发大赛", type: "项目", rating: 3 },
    ];
    const out = adaptItems(items, prevCards);
    const names = out.map((c) => c.name);
    expect(names).toContain("WorkBuddy");
    expect(names).not.toContain("GLM-5.3-Flash（Ox-Alpha）");
    expect(names).not.toContain("2026 微信小程序开发大赛");
    expect(out).toHaveLength(items.filter((i) => i.sponsored !== true && (i.category === "tool" || i.category === "model")).length); // 实测 33 = 36 − sponsored 3（含 event 豆包）；小米 MiMo 的 hide 发生在下游 applySiteConfig，故适配层出 33、落盘 32
  });

  it("⑦ 本地无对应旧卡 → 纯事实 7 键新卡，键序恒等于 FACT_FIELDS（幂等地基）", () => {
    const out = adaptItems([find("ZCode")], []);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0])).toEqual(FACT_FIELDS);
    expect(out[0]).toMatchObject({ name: "ZCode", type: "工具", updated: "2026-09-28" });
  });

  it("⑧ 脏输入不抛错只跳过；输出顺序 = 上游 items 顺序；注入条目落在表头", () => {
    const dirty = [null, undefined, {}, { name: "   ", category: "tool" }, find("WorkBuddy")] as any[];
    expect(adaptItems(dirty, []).map((c) => c.name)).toEqual(["WorkBuddy"]);
    const injected = JSON.parse(
      injectUpstreamItem(readFileSync(path.resolve(process.cwd(), "tests/fixtures/upstream-data.json"), "utf8"), {
        name: "单元注入卡",
        category: "model",
        quota: "100 万 tokens",
        entry_url: "https://inj.example/?userCode=ygtxup80",
        last_verified: "2026-09-29",
      })
    ).items as Record<string, unknown>[];
    expect(adaptItems(injected, []).slice(0, 2).map((c) => c.name)).toEqual(["单元注入卡", "WorkBuddy"]);
    expect(adaptItems(injected, [])[0].link).toBe("https://inj.example/?userCode=ygtxup80"); // 适配层不清洗
  });
});

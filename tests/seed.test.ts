import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { linkRisk } from "../crawler/clean.mjs";
import { buildSeed, dropWarning, loadLocal } from "../scripts/export-seed.mjs";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const tokens = JSON.parse(read("data/tokens.json"));
const donots = JSON.parse(read("data/donots.json"));
const rules = JSON.parse(read("data/rules.json"));
const meta = JSON.parse(read("data/meta.json"));

/* Q4/Q5 直通验证：管线输出必须等于磁盘快照。此处现算一次 buildSeed，
   与 seed:repro 的 CLI 门禁互为备份（vitest 在 CI 里先跑，seed:repro 单独跑）。 */
const PIPELINE = buildSeed(read("tests/fixtures/upstream-data.json"), JSON.parse(read("config/site-config.json")), loadLocal());

describe("种子数据（上游 data.json 快照 + 本地基底 → buildSeed 导出）", () => {
  it("条数与上游一致", () => {
    expect(tokens).toHaveLength(36 - 3 - 1); // 上游 36 − sponsored 3（Q6）− site-config hide 1（小米 MiMo，Q8）
    expect(donots).toHaveLength(22);
    expect(meta.counts).toEqual({ tokens: 32, donots: 22 });
  });

  it("全量链接过 linkRisk（与 seed 脚本同一份判定，含 hash 参数与推广短链域）", () => {
    const bad = [...tokens, ...donots].flatMap((x) =>
      [x.link, x.extraAction && x.extraAction.link]
        .map((u) => [x.name, u, linkRisk(u)])
        .filter((r) => r[2])
    );
    expect(bad.map((b) => `${b[0]} ${b[1]} → ${b[2]}`)).toEqual([]);
  });

  it("不含原作者邀请码池与微信号", () => {
    const raw = read("data/tokens.json") + read("data/donots.json");
    expect(raw).not.toContain("lmfh2022");
    expect(raw).not.toContain("AATGOEHF");
    expect(raw).not.toContain("ygtxup80");
    expect(raw).not.toContain("CQLBPC");
    expect(tokens.every((t: any) => t.inviteCodes === undefined)).toBe(true);
  });

  it("不含原作者海报物料", () => {
    expect(tokens.every((t: any) => t.poster === undefined)).toBe(true);
  });

  it("规则表可还原为 RegExp 且门槛标签齐全", () => {
    expect(rules.featured.map((r: any) => r.label)).toEqual([
      "DeepSeek V4", "GLM 5.2", "Kimi K3", "千问 3.8 Max", "Hy3", "LongCat 2.0",
    ]);
    rules.featured.forEach((r: any) => expect(() => new RegExp(r.source, r.flags)).not.toThrow());
    expect(rules.logo.length).toBe(32);
    expect(rules.cardCopy.length).toBe(19);
    expect(rules.detailSlug.length).toBe(21);
    /* flags 必须一路带到 rules.json：丢了 /i，`detailSlug("WorkBuddy")` 会回落 item-xxxxxx */
    const pair = [...rules.logo, ...rules.cardCopy, ...rules.detailSlug];
    expect(pair.every((r: any) => r.flags === "i")).toBe(true);
    expect(pair.every((r: any) => new RegExp(r.source, r.flags) instanceof RegExp)).toBe(true);
  });

  it("每条卡都有 name/type/updated，日期格式为 ISO", () => {
    tokens.forEach((t: any) => {
      expect(typeof t.name).toBe("string");
      expect(["大模型", "工具", "项目"]).toContain(t.type);
      expect(t.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("meta 含条数，lastSyncedSha 为 null 表示本地种子", () => {
    expect(meta.counts).toEqual({ tokens: tokens.length, donots: donots.length });
    expect(meta.lastSyncedSha).toBeNull();
    expect(meta.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta.issueNo).toBeUndefined();
  });

  it("Q1/Q3/Q9：事实随上游刷新、观点字段保留、改名走 alias", () => {
    const by = (n: string) => tokens.find((t: any) => t.name === n);
    const wb = by("WorkBuddy");
    expect(wb.updated).toBe("2026-09-28"); // Q3：事实层 updated 取上游 last_verified
    expect(wb.quota).toBe("HY3 限免至 2026-09-30；HY4 preview 新用户首开对话起 14 天内免费。"); // 上游逐字
    expect(wb.rating).toBe(5); // 观点层：上游无载体，必须从本地继承
    expect(typeof wb.effect).toBe("string");
    expect(by("Qoder cn")).toBeUndefined(); // 上游名不得落库
    const q = by("阿里云 Qoder（灵码）"); // Q9 alias 生效，观点字段才保得住
    expect(q.modality).toBe("Qwen3.8-Flash · Qwen3.8-Max");
    expect(q.limited).toBe("2026-09-30");
    /* Q2：11 张仅本地存在的旧卡全部跟随下架，永不复活（名单逐字见计划 0.1） */
    const gone = [
      "GLM-5.3-Flash（Ox-Alpha）", "蓝博科技（lanbuff）", "2026 微信小程序开发大赛",
      "HuggingFace Inference API", "月之暗面 Kimi 开放平台", "OpenStarry", "腾讯云 TokenHub",
      "太行HUB（token.taiha.cn）", "B.AI（AI 模型聚合平台）", "GMI Cloud（gmi-serving）", "秒哒（百度）",
    ];
    expect(gone).toHaveLength(11);
    expect(tokens.filter((t: any) => gone.includes(t.name))).toEqual([]);
    /* Q8：4 张新卡全收 */
    for (const n of ["ZCode", "字节 TRAE（AI IDE）", "阿里云百炼（DashScope）", "书生·端砚 墨点计划（上海AI实验室）"]) {
      expect(by(n)).toBeTruthy();
    }
  });

  it("Q4/Q5：观望名单与规则表由本地快照直通，上游 retired 一条也没进表", () => {
    expect(JSON.stringify(PIPELINE.donots)).toBe(JSON.stringify(donots));
    expect(JSON.stringify(PIPELINE.rules)).toBe(JSON.stringify(rules));
    expect(PIPELINE.cards).toHaveLength(tokens.length);
    /* retired 名单里的卡名绝不能凭空出现在 donots（donots 与切换前逐字一致即已证，这里再点一次） */
    const retired = JSON.parse(read("tests/fixtures/upstream-data.json")).retired.map((r: any) => r.name);
    expect(retired).toContain("阿里云 Qoder（灵码）"); // 上游确实把它挪进了 retired
    expect(tokens.some((t: any) => t.name === "阿里云 Qoder（灵码）")).toBe(true); // alias 后仍在线
  });

  it("可复现：管线导出与磁盘快照同 SHA256（pipeline↔disk 等价，幂等红线的单测层）", () => {
    const sha = (o: unknown) =>
      createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 12);
    // 原来比的是 sha(tokens) vs sha(重读同一文件)＝同一表达式比自身，恒真；改比「管线产物」与「磁盘」
    expect(sha(PIPELINE.cards)).toBe(sha(tokens));
    expect(sha(PIPELINE.cards)).toBe("ba754253ebaa"); // 计划 §0.1 实测哈希：换卡必须显式改这里
  });

  it("四道 fail-stop 护栏：基底缺失或上游全被挡架都拒绝导出，绝不发布空壳", () => {
    const CONFIG = JSON.parse(read("config/site-config.json"));
    const src = read("tests/fixtures/upstream-data.json");
    /* 正则各自锚定本护栏独有的措辞：/决策 Q1/ 会同时命中基底缺失与下限闸两条消息，
       届时「护栏被绕过」和「换了一道闸生效」在断言里长得一样。 */
    expect(() => buildSeed(src, CONFIG, { ...loadLocal(), cards: [] })).toThrow(/tokens\.json 作观点字段基底/);
    expect(() => buildSeed(src, CONFIG, { ...loadLocal(), donots: null })).toThrow(/观望名单已转本地维护/);
    expect(() => buildSeed(src, CONFIG, { ...loadLocal(), rules: null })).toThrow(/规则表已转本地固定资产/);
    /* 上游 category 整体改名：items 非空、解析通过，但适配层一条都不收 → 必须停在落盘之前 */
    const json = JSON.parse(src);
    const drifted = JSON.stringify({
      ...json,
      items: json.items.map((i: any) => ({ ...i, category: "tools" })),
    });
    expect(() => buildSeed(drifted, CONFIG, loadLocal())).toThrow(/收取数为 0/);
  });

  it("落盘前降幅告警：超阈值出声提醒，正常下架与新增不出声", () => {
    expect(dropWarning(32, 18)).toContain("32→18（降幅 44%）");
    expect(dropWarning(32, 25)).toContain("降幅 22%"); // 32 张基数下掉 7 张＝首个越界降幅
    expect(dropWarning(32, 26)).toBeNull(); // 19% ≤ 阈值：决策 Q2 的正常跟随下架不该报警
    expect(dropWarning(32, 32)).toBeNull();
    expect(dropWarning(32, 35)).toBeNull(); // 上游新增卡不算降幅
    expect(dropWarning(0, 5)).toBeNull(); // 基底为空时 buildSeed 已先抛，这里不叠第二条噪音
  });
});

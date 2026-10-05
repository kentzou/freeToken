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
  it("条数与上游一致：管线收取数由冻结 fixture 决定，磁盘条数只增不减", () => {
    /* 期望值来自 tests/fixtures/upstream-data.json 的 items 长度（36）− 决策 Q6 挡掉的 sponsored 3。
       fixture 是冻结快照，这个数只会在「有意更新 fixture」时才变——那时才该显式改这里。 */
    expect(PIPELINE.cards).toHaveLength(36 - 3);
    expect(donots).toHaveLength(22); // donots 是本地固定资产（决策 Q4），crawler 不改它
    /* 磁盘条数不能写死：crawler 会持续加卡，写死等于给流水线埋一颗每 6 小时响一次的雷。
       真正的不变式是「磁盘条数 ≥ 管线收取数」——磁盘只会比冻结 fixture 更全，不会更少。 */
    expect(tokens.length).toBeGreaterThanOrEqual(PIPELINE.cards.length);
    expect(meta.counts).toEqual({ tokens: tokens.length, donots: donots.length });
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
      /* 后三条为 2026-10-05 扩充：放行腾讯元器 / 百度千帆（文心）/ 讯飞星火（开放平台）。
         放行面与「零误伤」由 tests/featured-gate.test.ts 用生产代码钉住。 */
      "腾讯元器", "百度千帆（文心）", "讯飞星火（开放平台）",
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

  it("meta 含条数；lastSyncedSha 是「本地种子 null」或「爬虫回填的 commit SHA」二选一", () => {
    expect(meta.counts).toEqual({ tokens: tokens.length, donots: donots.length });
    /* lastSyncedSha 的语义见 scripts/export-seed.mjs：buildSeed 产出时恒为 null（本地种子），
       爬虫侧会用 commit SHA 覆盖它。所以合法形态只有两种——null，或一个 40 位十六进制串。
       原来钉死 toBeNull()，等于断言「这个仓库永远不做真实同步」，上游一切同步就会假红。 */
    expect(meta.lastSyncedSha === null || /^[0-9a-f]{40}$/i.test(meta.lastSyncedSha)).toBe(true);
    /* sourceFingerprint 是上游快照原文的 sha256 前 16 位（buildSeed 现算），钉死同样会随上游换代假红 */
    expect(meta.sourceFingerprint).toMatch(/^[0-9a-f]{16}$/);
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
    /* retired 名单里的卡名绝不能凭空出现在 donots（donots 与切换前逐字一致即已证，这里再点一次） */
    const retired = JSON.parse(read("tests/fixtures/upstream-data.json")).retired.map((r: any) => r.name);
    expect(retired).toContain("阿里云 Qoder（灵码）"); // 上游确实把它挪进了 retired
    expect(tokens.some((t: any) => t.name === "阿里云 Qoder（灵码）")).toBe(true); // alias 后仍在线
  });

  it("管线↔磁盘等价：管线产出的卡逐字在磁盘上，磁盘多出的卡来自冻结 fixture 之外的新上游", () => {
    /* 这条替代了原来的「sha(PIPELINE.cards) 钉死 "64e26640c52d" + 与磁盘等长」。
       钉哈希在有 crawler 的仓库里必然反复炸：buildSeed 以**实时** data/tokens.json 作观点基底
       （loadLocal），磁盘每多一张卡基底就变、哈希就变，而 .github/workflows/crawl.yml 从不重签哈希
       ——crawler 每 6 小时加一张卡，CI 的 quality job 就红一次。真正该守的不变式是下面三条，
       都与「数据增长多少张」无关：
         ① 管线看见的每一张卡，磁盘上必须存在且逐字段完全相同（观点层没被管线改坏）；
         ② 管线产出的卡必须全部来自冻结 fixture 的 items/retired（没有跑飞造出幽灵卡）；
         ③ 磁盘多出的卡必须不在冻结 fixture 里（它们是真实上游新增，不是管线污染）。
       ①②③ 任一被破坏都会红；数据正常增长不会红。 */
    const upstream = JSON.parse(read("tests/fixtures/upstream-data.json"));
    const upstreamNames = new Set([...upstream.items, ...upstream.retired].map((i: any) => i.name));
    const diskByName = new Map(tokens.map((t: any) => [t.name, t]));
    const diskNames = new Set(diskByName.keys());

    // ①
    expect(PIPELINE.cards.filter((c: any) => !diskNames.has(c.name))).toEqual([]);
    expect(PIPELINE.cards.map((c: any) => diskByName.get(c.name))).toEqual(PIPELINE.cards);
    // ②
    expect(PIPELINE.cards.filter((c: any) => !upstreamNames.has(c.name))).toEqual([]);
    // ③
    const extra = tokens.filter((t: any) => !PIPELINE.cards.some((c: any) => c.name === t.name));
    expect(extra.length).toBeGreaterThan(0); // 样本量：③ 若无多出卡则该条空转，先钉住「确实有新增」这个前提
    expect(extra.filter((t: any) => upstreamNames.has(t.name)).map((t: any) => t.name)).toEqual([]);
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

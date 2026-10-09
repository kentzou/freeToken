import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { linkRisk } from "../crawler/clean.mjs";
import { NAME_ALIAS } from "../crawler/adapt.mjs";
import { buildSeed, dropWarning, loadLocal } from "../scripts/export-seed.mjs";
import { loadLocalCards, reconcileLocalCards } from "../crawler/local-cards.mjs";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const tokens = JSON.parse(read("data/tokens.json"));
const donots = JSON.parse(read("data/donots.json"));
const rules = JSON.parse(read("data/rules.json"));
const meta = JSON.parse(read("data/meta.json"));

/* Q4/Q5 直通验证：管线输出必须等于磁盘快照。此处现算一次 buildSeed，
   与 seed:repro 的 CLI 门禁互为备份（vitest 在 CI 里先跑，seed:repro 单独跑）。 */
const PIPELINE = buildSeed(read("tests/fixtures/upstream-data.json"), JSON.parse(read("config/site-config.json")), loadLocal());

/* 冻结 fixture 的卡名（经 NAME_ALIAS 归一到本站定名）：等价红线 ①②③ 与本地对账四处共用同一份口径，
   否则「上游改名」会在不同用例里表现为不同的判定结果。别名映射与 adaptItem 完全同源。 */
const FIXTURE_NAMES: Set<string> = new Set(
  (() => {
    const u = JSON.parse(read("tests/fixtures/upstream-data.json"));
    return [...u.items, ...u.retired].map((i: any) =>
      Object.hasOwn(NAME_ALIAS, i.name) ? (NAME_ALIAS as Record<string, string>)[i.name] : i.name
    );
  })()
);
/** config/local-cards.json 里登记的卡名（首批为 `[]`；加卡后不必等 crawl 也能被 ①② 认出来，见 D-4）。 */
const LOCAL_NAMES: string[] = (JSON.parse(read("config/local-cards.json")) as any[]).map((c) => c.name);
/* 真正由本地供给的卡名 ＝ 名单里「冻结上游没有」的那部分（决策 #8：与上游同名的一律由上游接管，
   本地条目不落地）。豁免必须按这份集合开，不能按 LOCAL_NAMES 全量开——否则只要有人把本地卡登记成
   与某张上游卡同名，那张上游卡就会从 ①「磁盘逐字相同」的镜子里溜出去，红线当场失牙。 */
const LOCAL_SOURCE_NAMES: string[] = LOCAL_NAMES.filter((n) => !FIXTURE_NAMES.has(n));
const EXPECTED_LOCAL_IN = LOCAL_SOURCE_NAMES.length;

describe("种子数据（上游 data.json 快照 + 本地基底 → buildSeed 导出）", () => {
  it("条数与上游一致：管线收取数由冻结 fixture 决定，磁盘条数只增不减", () => {
    /* 期望值来自 tests/fixtures/upstream-data.json 的 items 长度（36）− 决策 Q6 挡掉的 sponsored 3。
       fixture 是冻结快照，这个数只会在「有意更新 fixture」时才变——那时才该显式改这里。 */
    expect(PIPELINE.cards).toHaveLength(36 - 3 + EXPECTED_LOCAL_IN);
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

  /* 逐卡链接覆盖是抓取每一轮都会重打的一层（crawler/run.mjs → buildSeed → applySiteConfig），
     所以磁盘上的 link 必须恒等于 config 声明值。反过来说：只改 data/tokens.json 而不改
     config/site-config.json，下一轮抓取（.github/workflows/crawl.yml）就把那个字段打回上游原值——
     「改哪一层才不会被覆盖」从此由这条判据守着，不再靠人记。
     基线实测：config 现有 10 条 link 声明，磁盘 10/10 逐字相等且每一条都命中得上的卡名。 */
  it("config 声明的逐卡 link 即权威：磁盘 tokens/donots 必须逐字一致", () => {
    const cfg = JSON.parse(read("config/site-config.json"));
    const declared = Object.entries<any>(cfg.cards ?? {}).filter(([, o]) => typeof o?.link === "string");
    expect(declared.length).toBeGreaterThan(0); // 前提：确有声明，否则下面两条判据都空转
    const byName = new Map<string, string>([...tokens, ...donots].map((x: any) => [x.name, x.link]));
    expect(declared.filter(([name]) => !byName.has(name)).map(([name]) => name)).toEqual([]); // 查无此卡＝静默失效
    const bad = declared
      .filter(([name, o]) => byName.get(name) !== o.link)
      .map(([name, o]) => `${name}：磁盘 ${byName.get(name)} ≠ 声明 ${o.link}`);
    expect(bad).toEqual([]);
  });

  it("规则表可还原为 RegExp 且门槛标签齐全", () => {
    expect(rules.featured.map((r: any) => r.label)).toEqual([
      "DeepSeek V4", "GLM 5.2", "Kimi K3", "千问 3.8 Max", "Hy3", "LongCat 2.0",
      /* 后四条为 2026-10-05 扩充：放行腾讯元器 / 百度千帆（文心）/ 讯飞星火（开放平台）/ OpenRouter
         （OpenRouter 由首页专用入口长条改判为普通情报卡，与其它卡同走门槛）。
         放行面与「零误伤」由 tests/featured-gate.test.ts 用生产代码钉住。 */
      "腾讯元器", "百度千帆（文心）", "讯飞星火（开放平台）", "OpenRouter",
    ]);
    rules.featured.forEach((r: any) => expect(() => new RegExp(r.source, r.flags)).not.toThrow());
    expect(rules.logo.length).toBe(32);
    expect(rules.cardCopy.length).toBe(19);
    expect(rules.detailSlug.length).toBe(22);
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
    /* 三条不变式（与数据增长无关）在计划 6 之后各加一条本地豁免，理由见 D-4：
       crawl.yml 只有 schedule/dispatch/issue_comment 三种触发且只在 main 跑，
       所以「config 里刚登记、磁盘还没落」是 PR 阶段的**正常中间态**，反向硬钉＝每个加卡的 PR 长红。
       豁免只开给 FIXTURE_NAMES 之外的本地卡；上游卡那条逐字对账一分不松。 */
    const diskByName = new Map(tokens.map((t: any) => [t.name, t]));
    const diskNames = new Set(diskByName.keys());
    const isLocal = (c: any) => LOCAL_SOURCE_NAMES.includes(c.name);

    const upstreamPart = PIPELINE.cards.filter((c: any) => !isLocal(c));
    // ① 上游来源的每一张，磁盘上必须存在且逐字段完全相同（观点层没被管线改坏）
    expect(upstreamPart.filter((c: any) => !diskNames.has(c.name))).toEqual([]);
    expect(upstreamPart.map((c: any) => diskByName.get(c.name))).toEqual(upstreamPart);
    // ①′ 本地卡若已经落盘，同样必须逐字相同（crawl 与 seed 共用同一套 normalize＋合并，不该出现第三种形态）
    const landed = PIPELINE.cards.filter((c: any) => isLocal(c) && diskNames.has(c.name));
    expect(landed.map((c: any) => diskByName.get(c.name))).toEqual(landed);
    // ② 管线产出的每张卡都要有来源：要么在冻结 fixture 里，要么在 local-cards.json 里
    expect(PIPELINE.cards.filter((c: any) => !FIXTURE_NAMES.has(c.name) && !isLocal(c))).toEqual([]);
    // ③ 磁盘多出的卡必须不在冻结 fixture 里（真实上游新增，不是管线污染）
    const extra = tokens.filter((t: any) => !PIPELINE.cards.some((c: any) => c.name === t.name));
    expect(extra.filter((t: any) => FIXTURE_NAMES.has(t.name)).map((t: any) => t.name)).toEqual([]);
    expect(extra.length).toBeGreaterThan(0); // 样本量前提：实测磁盘比管线多 20 张（§1 基线）
  });

  it("本地增补卡经 buildSeed 合入：落在尾部、带 origin、原 33 张一字未改（spec §6.3）", () => {
    const CONFIG = JSON.parse(read("config/site-config.json"));
    const src = read("tests/fixtures/upstream-data.json");
    // 测试专用合成卡：只在内存里过一遍 buildSeed，不落盘、不进 config（§3 红线）
    const probe = {
      name: "本站增补探针",
      type: "工具",
      quota: "每日 100 次",
      link: "https://example.com/probe",
      sourceUrl: "https://example.com/probe#pricing",
      updated: "2026-10-09",
    };
    const seed = buildSeed(src, CONFIG, { ...loadLocal(), localCards: [probe] });
    expect(seed.cards).toHaveLength(PIPELINE.cards.length + 1);
    expect(seed.cards.slice(0, -1)).toEqual(PIPELINE.cards); // 上游那 33 张逐字段不变，也不被挤位
    const tail: any = seed.cards[seed.cards.length - 1];
    expect(tail.name).toBe("本站增补探针");
    expect(tail.origin).toBe("local");
    expect(tail.sourceUrl).toBe("https://example.com/probe#pricing");
    expect(tail.checkedAt).toBe("2026-10-09");
    expect(seed.meta.counts).toEqual({ tokens: seed.cards.length, donots: seed.donots.length });

    // 合并点必须在 applySiteConfig **之前**：hide 才管得到本地卡（spec 复核记 5）
    // §3 勘误 4：config 必须以真 CONFIG 展开为基底——上游 WorkBuddy/七牛云/小米 3 张的推广短链
    // 只有 site-config 的逐卡 link 覆盖兜得住，裸 { cards: {…} } 会先被 buildSeed 的 linkRisk
    // 守卫抛「清洗失败」，根本走不到下面这行 hide 断言（不放松守卫，见裁决「确保质量」）。
    const hidden = buildSeed(src, { ...CONFIG, cards: { ...CONFIG.cards, "本站增补探针": { hide: true } } }, { ...loadLocal(), localCards: [probe] });
    expect(hidden.cards.some((c: any) => c.name === "本站增补探针")).toBe(false);
    // 只钉「探针不在」有空转面：`hidden.cards` 若整批为空，`some()` 同样返回 false。
    // 长度钉的是「合并后的 34 张里只被 hide 掉那 1 张」——空转与误删一并排除（执行期评审 Minor ⇒ R-9）。
    // 写成 PIPELINE.cards.length 而非 33：将来本地表加了卡，这个等式仍成立（§1「基线＋增量」同一口径）。
    expect(hidden.cards).toHaveLength(PIPELINE.cards.length);

    // 坏条目要在动笔前抛，并点名下标；loadLocal 读的是真文件（现在是空表）
    expect(() => buildSeed(src, CONFIG, { ...loadLocal(), localCards: [{ name: "缺键卡" }] })).toThrow(/local-cards#0（缺键卡）/);
    expect(loadLocalCards(read("config/local-cards.json"))).toEqual([]);
    expect(loadLocal().localCards).toEqual([]);
  });

  it("本地增补来源双向对账：管线标 local 的集合 == 本地名单 − 冻结上游名单；磁盘只查『贴标必有出处』", () => {
    // 管线侧双向：该标的都标了、标的都在名单里、被上游接管的不会残在本站标记里
    const localInPipeline = PIPELINE.cards.filter((c: any) => c.origin === "local").map((c: any) => c.name);
    expect(localInPipeline.slice().sort()).toEqual(LOCAL_SOURCE_NAMES.slice().sort());
    // 磁盘侧单向 + 形态完备（D-4：反向要等 crawl，不该在这里咬人）
    expect(reconcileLocalCards(tokens, LOCAL_NAMES)).toEqual([]);
    expect(reconcileLocalCards(PIPELINE.cards, LOCAL_NAMES)).toEqual([]);
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

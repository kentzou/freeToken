import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSeed } from "../scripts/export-seed.mjs";
import { crawlOnce, mergePending, notifyIssueTitle, syncOnce } from "../crawler/run.mjs";

const FIXTURE = readFileSync("tests/fixtures/upstream-app.js", "utf8");
const CONFIG = JSON.parse(readFileSync("config/site-config.json", "utf8"));
const BASE_META = JSON.parse(readFileSync("data/meta.json", "utf8"));
const SEED = buildSeed(FIXTURE, CONFIG);
const PREV = { cards: SEED.cards, donots: SEED.donots, rules: SEED.rules };

const noSleep = () => Promise.resolve();
function res(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function mkFetch(...responses: unknown[]) {
  const calls: { url: string; init: Record<string, unknown> }[] = [];
  let i = 0;
  const fn = async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as Record<string, unknown> });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

describe("syncOnce：两队列互不阻塞（spec §7.6）", () => {
  it("新增卡直接进 data（保持上游顺序），pending 不含它", () => {
    const added = { name: "新卡A", type: "工具", updated: "2026-09-29", link: "https://a.example/" };
    const { data, pending } = syncOnce({
      prev: { cards: [], donots: [], rules: PREV.rules },
      next: { cards: [added], donots: [], rules: PREV.rules },
      existingPending: null,
      upstreamSha: "sha1",
      detectedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(data.cards).toEqual([added]);
    expect(pending.changes).toHaveLength(0);
  });

  it("修改卡：data 保留旧值（before），pending 携带 after 供审批", () => {
    const before = { name: "改卡B", type: "大模型", updated: "2026-09-01", quota: "旧额度" };
    const after = { ...before, updated: "2026-09-29", quota: "新额度" };
    const { data, pending } = syncOnce({
      prev: { cards: [before], donots: [], rules: PREV.rules },
      next: { cards: [after], donots: [], rules: PREV.rules },
      existingPending: null,
      upstreamSha: "sha1",
      detectedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(data.cards).toEqual([before]);
    expect(pending.changes).toHaveLength(1);
    expect(pending.changes[0].after.quota).toBe("新额度");
  });

  it("删除卡：卡片保留在 data 尾部（待审期间照常展示），pending after=null", () => {
    const gone = { name: "删卡C", type: "工具", updated: "2026-09-01" };
    const keep = { name: "留卡D", type: "工具", updated: "2026-09-02" };
    const { data, pending } = syncOnce({
      prev: { cards: [gone, keep], donots: [], rules: PREV.rules },
      next: { cards: [keep], donots: [], rules: PREV.rules },
      existingPending: null,
      upstreamSha: "sha1",
      detectedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(data.cards.map((c: { name: string }) => c.name)).toEqual(["留卡D", "删卡C"]);
    expect(pending.changes[0].fields[0]).toEqual({ field: "(整条)", from: "存在", to: null });
  });

  it("规则表任一变动：rules 整表持旧版 + pending 出现 rules 条目", () => {
    const { data, pending } = syncOnce({
      prev: PREV,
      next: { ...PREV, rules: { ...PREV.rules, featured: [] } },
      existingPending: null,
      upstreamSha: "sha1",
      detectedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(data.rules).toEqual(PREV.rules);
    expect(pending.changes.map((e: { kind: string }) => e.kind)).toEqual(["rules"]);
  });

  it("mergePending：同键取最新，旧未决条目保留", () => {
    const existing = {
      changes: [
        { kind: "card", name: "旧未决", before: {}, after: { x: 1 }, fields: [] },
        { kind: "card", name: "改卡B", before: {}, after: { x: "旧检测" }, fields: [] },
      ],
    };
    const detected = [{ kind: "card", name: "改卡B", before: {}, after: { x: "新检测" }, fields: [] }];
    const m = mergePending({ existing, detected, upstreamSha: "sha2", detectedAt: "t" });
    expect(m.upstreamSha).toBe("sha2");
    expect(m.changes).toHaveLength(2);
    expect(m.changes.find((e: { name: string }) => e.name === "改卡B").after.x).toBe("新检测");
    expect(m.changes.find((e: { name: string }) => e.name === "旧未决")).toBeTruthy();
  });
});

describe("crawlOnce：端到端（假 transport + fixture 文本）", () => {
  it("无变化早退：latest sha 与 meta 相同 → 零文件产出", async () => {
    const s = await crawlOnce({
      prev: PREV,
      meta: { ...BASE_META, lastSyncedSha: "abc123" },
      config: CONFIG,
      latestSha: "abc123",
      sourceText: FIXTURE,
    });
    expect(s.unchanged).toBe(true);
    expect(s.files).toEqual({});
  });

  it("fixture 注入脏链接新卡 → 自动清洗入库，files 里无 userCode，pending 为空", async () => {
    const injected = FIXTURE.replace(
      "const TOKENS = [",
      'const TOKENS = [ {name:"管线集成卡", type:"大模型", quota:"每日 100 次", updated:"2026-09-29", link:"https://b.example/promo?userCode=ygtxup80"}, '
    );
    const s = await crawlOnce({
      prev: PREV,
      meta: BASE_META,
      config: CONFIG,
      latestSha: "newsha1",
      sourceText: injected,
      now: "2026-09-29T12:00:00.000Z",
    });
    expect(s.added).toEqual(["管线集成卡"]);
    expect(s.files["data/tokens.json"]).toContain("https://b.example/promo");
    expect(s.files["data/tokens.json"]).not.toContain("userCode");
    expect(s.files["data/meta.json"]).toContain("newsha1");
    expect(s.files["pending/changes.json"]).toBeUndefined();
    expect(s.pendingTotal).toBe(0);
  });

  it("有新增且带 token → 只开 auto 标签的通知 Issue（标题含新增数）", async () => {
    const injected = FIXTURE.replace(
      "const TOKENS = [",
      'const TOKENS = [ {name:"通知卡", type:"工具", quota:"每日 20 次", updated:"2026-09-29", link:"https://n.example/"}, '
    );
    const { fn, calls } = mkFetch(res(201, { number: 11, html_url: "https://gh/x/11" }));
    const s = await crawlOnce({
      prev: PREV, meta: BASE_META, config: CONFIG, latestSha: "newsha3", sourceText: injected,
      token: "t", repo: "me/site", fetchImpl: fn, sleep: noSleep,
    });
    expect(s.unchanged).toBe(false);
    const post = calls.find((c) => c.init.method === "POST" && String(c.url).endsWith("/issues"));
    expect(post).toBeTruthy();
    const body = JSON.parse(post!.init.body as string);
    expect(body.labels).toEqual(["auto"]);
    expect(body.title).toContain("新增 1");
  });

  it("审核 Issue 正文含 keyOf id 与 /approve 指令；同键未变则不重复开 Issue；notify 标题纯函数钉死", async () => {
    const prev = { ...PREV, cards: PREV.cards.map((c: Record<string, unknown>, i: number) => (i === 0 ? { ...c, quota: "旧文案" } : c)) };
    const { fn, calls } = mkFetch(res(201, { number: 9, html_url: "https://gh/x/9" }));
    const s = await crawlOnce({
      prev,
      meta: BASE_META,
      config: CONFIG,
      latestSha: "newsha2",
      sourceText: FIXTURE,
      token: "t",
      repo: "me/site",
      fetchImpl: fn,
      sleep: noSleep,
    });
    expect(s.changedIds.length).toBeGreaterThan(0);
    const post = calls.find((c) => c.init.method === "POST" && c.url.endsWith("/issues"));
    expect(post).toBeTruthy();
    const body = JSON.parse(post!.init.body as string);
    expect(body.labels).toEqual(["review"]);
    expect(body.title).toContain("审核");
    expect(body.body).toContain(`card:${prev.cards[0].name}`);
    expect(body.body).toContain("/approve");
    // 同一批 pending 再跑一次（existingPending 传入）→ 不重复开审核 Issue（防 6h 刷屏），文件照常产出
    const { fn: fn2, calls: calls2 } = mkFetch(res(201, { number: 1, html_url: "u" }));
    const s2 = await crawlOnce({
      prev, meta: BASE_META, config: CONFIG, latestSha: "newsha2", sourceText: FIXTURE,
      token: "t", repo: "me/site", fetchImpl: fn2, sleep: noSleep,
      existingPending: { changes: s.pendingEntries },
    });
    expect(calls2.filter((c) => c.init.method === "POST" && String(c.url).endsWith("/issues") && JSON.parse(c.init.body as string).labels?.[0] === "review")).toHaveLength(0);
    expect(s2.pendingTotal).toBe(s.pendingTotal);
    // notify 标题纯函数（终审 #7 场景：新增自动上线时只列新增，不含改删）
    expect(notifyIssueTitle({ added: [{ name: "x" }], sha: "s" })).toContain("新增 1");
  });
});

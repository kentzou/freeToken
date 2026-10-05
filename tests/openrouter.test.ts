import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPENROUTER_KEY_URL, OPENROUTER_MODELS_URL, QUOTA_POLICY, crawlOpenRouter, parseFreeModels,
} from "../crawler/openrouter.mjs";
import { mkFetch, res } from "./helpers/fake-fetch";

/** fixture 取自 2026-09-30 真实 GET /api/v1/models 响应：整段保留上游原序（乱序，非人为排好），
 *  仅删去 description/supported_parameters/canonical_slug/hugging_face_id/created 五个与判据无关的大字段；
 *  选型刻意覆盖：:free 变体 3 个、单价为 0 但无 :free 后缀的 openrouter/free 1 个、付费 1 个。 */
const FIXTURE = JSON.parse(readFileSync("tests/fixtures/openrouter-models.json", "utf8"));
const NOW = "2026-09-30T06:00:00.000Z";

describe("OpenRouter 免费模型台账（额度只有一份，逐模型只记能证实的）", () => {
  it("分流：4 个免费入选、付费那条被排除，且按 id 定序（每日 diff 只反映真实增删）", () => {
    const doc = parseFreeModels(FIXTURE, { now: NOW });
    expect(doc.totalModels).toBe(5);
    expect(doc.freeModelCount).toBe(4);
    expect(doc.models.map((m: any) => m.id)).toEqual([
      "google/gemma-4-31b-it:free",
      "liquid/lfm-2.5-2.6b:free",
      "openrouter/free",
      "thinkingmachines/inkling:free",
    ]);
    const gemma = doc.models[0];
    expect(gemma).toMatchObject({
      name: "Google: Gemma 4 31B (free)",
      freeVariant: true,
      tokenPriceZero: true,
      contextLength: 262144,
      maxCompletionTokens: 32768,
      modality: "text+image+video->text",
    });
  });

  it("额度口径只落在顶层 quotaPolicy 一处：逐模型用 quotaRef 指它，且官方就是「不按模型分配」", () => {
    const doc = parseFreeModels(FIXTURE, { now: NOW });
    expect(doc.quotaPolicy).toEqual(QUOTA_POLICY);
    expect(QUOTA_POLICY.perModelAllocation).toBeNull(); // 不是缺数据，是 policy 本身不按模型分配
    expect(QUOTA_POLICY).toMatchObject({ scope: "account", requestsPerMinute: 20, creditsThreshold: 10 });
    expect(QUOTA_POLICY.requestsPerDay).toEqual({ lessThanCreditsThreshold: 50, atLeastCreditsThreshold: 1000 });
    for (const m of doc.models) expect(m.quotaRef).toBe("quotaPolicy");
    expect(JSON.stringify(doc).match(/requestsPerMinute/g)).toHaveLength(1); // 数字写两遍＝两份会各自腐
    // 额度数值是代码常量而非抓取所得（接口不返回它们）：scraped 必须钉在 false，防止后来人把它当成「每天核对过」
    expect(doc.quotaPolicy.scraped).toBe(false);
    expect(doc.quotaPolicy.verifiedAt).toBe("2026-09-30");
  });

  it("回退：openrouter/free 无 :free 后缀但单价为 0 也入选；top_provider 给 null 时上下文退回模型级字段", () => {
    const doc = parseFreeModels(FIXTURE, { now: NOW });
    const router = doc.models.find((m: any) => m.id === "openrouter/free")!;
    expect(router).toBeDefined(); // 先钉「确实入选」，再逐字段钉回退，免得 find 落空时只报 undefined 看不懂
    expect(router.freeVariant).toBe(false);
    expect(router.tokenPriceZero).toBe(true);
    expect(router.contextLength).toBe(200000); // top_provider.context_length 为 null → m.context_length
    expect(router.maxCompletionTokens).toBeNull(); // 上游确实没给，如实留 null，不编一个上限
  });

  it("四条形态守卫全部 fail-stop：宁可整轮报错，也不能把「解析了一半」当成「上游清空了」", () => {
    for (const bad of [null, 42, [], {} as any, { data: [] }, { data: [{ id: "x" }, { name: "无 id" }] }]) {
      expect(() => parseFreeModels(bad, { now: NOW })).toThrowError(/形态异常/);
    }
    // 全表都是付费模型 → 判据已变，同样拒产（否则台账会被悄悄清成空站）
    const paidOnly = { data: [{ id: "openai/gpt-6.1-sol-pro", ...FIXTURE.data.find((m: any) => m.id === "openai/gpt-6.1-sol-pro") }] };
    expect(() => parseFreeModels(paidOnly, { now: NOW })).toThrowError(/无一个免费模型/);
  });

  it("编排：注入 fetch 即全测；无 key 不写 accountQuota，有 key 才落真实余量", async () => {
    const { fn, calls } = mkFetch(res(200, FIXTURE));
    const { doc, files } = await crawlOpenRouter({ fetchImpl: fn, now: NOW });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OPENROUTER_MODELS_URL);
    expect(doc.fetchedAt).toBe(NOW);
    expect(doc.sourceFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect("accountQuota" in doc).toBe(false); // 没查过就整个字段不出现，绝不占位冒充

    const rel = "data/openrouter.json";
    expect(Object.keys(files)).toEqual([rel]);
    expect(files[rel].endsWith("\n")).toBe(true);
    expect(JSON.parse(files[rel]).freeModelCount).toBe(4);

    const key = { data: { free_model_daily_requests: { used: 12, limit: 50, remaining: 38 } } };
    const keyed = mkFetch(res(200, FIXTURE), res(200, key));
    const withKey = await crawlOpenRouter({ fetchImpl: keyed.fn, now: NOW, apiKey: "sk-or-test" });
    expect(withKey.doc.accountQuota).toEqual({ used: 12, limit: 50, remaining: 38 });
    expect(withKey.doc.accountQuotaError).toBeUndefined();
    expect(keyed.calls[1]).toMatchObject({ url: OPENROUTER_KEY_URL, init: { headers: { Authorization: "Bearer sk-or-test" } } });

    const failing = mkFetch(res(200, FIXTURE), res(401));
    const keyFail = await crawlOpenRouter({ fetchImpl: failing.fn, now: NOW, apiKey: "sk-or-test" });
    expect(keyFail.doc.accountQuotaError).toBe("GET /api/v1/key HTTP 401"); // 余量查不到要留痕，不能静默当成「无余量」
    expect("accountQuota" in keyFail.doc).toBe(false);

    await expect(crawlOpenRouter({ fetchImpl: mkFetch(res(500)).fn, now: NOW })).rejects.toThrowError(/HTTP 500/);
    await expect(crawlOpenRouter({ fetchImpl: mkFetch(res(200, { data: [] })).fn, now: NOW })).rejects.toThrowError(/形态异常/);
  });
});

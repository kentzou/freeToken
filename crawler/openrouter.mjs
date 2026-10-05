/** 上游 openrouter.ai /api/v1/models 的免费模型台账（计划 4 追加的第二数据源，与 tokens 管线解耦）。
 *  定位：本文件只产 data/openrouter.json，绝不写 data/tokens.json|donots.json|rules.json，
 *  因此不进入 syncOnce 的两队列、也不触碰决策 #7「修改/删除持旧待审」的红线。
 *  真实性红线：OpenRouter 官方不把免费额度按模型分配（额度是账号级 20 次/分钟 + 每日次数上限），
 *  所以逐模型只记「能证实的东西」（单价为 0、上下文、最大输出、模态），
 *  额度口径以 quotaRef 指向顶层唯一一份 quotaPolicy——写两遍数字必然各自腐掉，禁止。 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";
export const OPENROUTER_LIMITS_DOC = "https://openrouter.ai/docs/limits";

/** 免费变体的额度口径（2026-09-30 实测官方 limits 文档）。
 *  诚实交代局限：/api/v1/models 接口不返回任何额度数值，所以这几个数是代码里的常量、
 *  每日抓取只会把它原样写进台账，**发现不了上游改政策**——阈值变了必须人工对着文档改这里。
 *  perModelAllocation 恒为 null 不是缺数据，而是官方 policy 就是「不按模型分配」。 */
export const QUOTA_POLICY = Object.freeze({
  source: OPENROUTER_LIMITS_DOC,
  scope: "account",
  perModelAllocation: null,
  appliesTo: "所有 id 以 :free 结尾、或 prompt/completion 单价均为 0 的模型变体",
  requestsPerMinute: 20,
  creditsThreshold: 10,
  requestsPerDay: { lessThanCreditsThreshold: 50, atLeastCreditsThreshold: 1000 },
  reset: "UTC 每日 0 点重置；换用其它免费模型不刷新计数",
  note: "OpenRouter 不为单个模型分配免费额度：免费体现在 token 单价为 0，请求次数受账号级共享上限约束。",
  // 这两键让读者能分辨「额度不是抓来的」：scraped=false 的字段每天原样复制，上游改政策时不会自己变
  scraped: false,
  verifiedAt: "2026-09-30",
});

const isZeroPrice = (v) => {
  if (typeof v !== "string" && typeof v !== "number") return false;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
};

/** pricing 的 prompt/completion 是否双双为 0（overrides 只在基础价非 0 时生效，无需下探） */
function tokenPriceZero(m) {
  const p = m?.pricing;
  if (!p || typeof p !== "object") return false;
  return isZeroPrice(p.prompt) && isZeroPrice(p.completion);
}

/** /api/v1/models 响应 → 规范化台账文档。纯函数：不碰网络与磁盘，注入即可全测。
 *  四条形态守卫全部 fail-stop（对齐 extract.mjs 的「解析了一半≠上游清空了」）：
 *  顶层非对象、data 缺失或为空、条目缺 id、免费模型数为 0——任一命中就抛，让调用方保留旧文件。 */
export function parseFreeModels(payload, { now }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("openrouter /models 形态异常：顶层不是对象");
  }
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("openrouter /models 形态异常：data 缺失或为空");
  }
  const bad = payload.data.findIndex((m) => !m || typeof m.id !== "string" || !m.id);
  if (bad >= 0) throw new Error(`openrouter /models 形态异常：data[${bad}] 缺 id`);

  const free = payload.data
    .filter((m) => m.id.endsWith(":free") || tokenPriceZero(m))
    .map((m) => {
      const tp = m.top_provider || {};
      return {
        id: m.id,
        name: m.name || m.id,
        // 两种免费判据分开记：:free 是官方免费变体，仅单价为 0 的多为预览/路由器，配额口径可能不同
        freeVariant: m.id.endsWith(":free"),
        tokenPriceZero: tokenPriceZero(m),
        quotaRef: "quotaPolicy",
        contextLength: tp.context_length ?? m.context_length ?? null,
        maxCompletionTokens: tp.max_completion_tokens ?? null,
        modality: m.architecture?.modality ?? null,
        moderated: tp.is_moderated ?? null,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // 按 id 定序：每日 diff 只反映真实增删

  if (free.length === 0) throw new Error("openrouter /models 异常：无一个免费模型（判据已变，拒绝写盘）");

  return {
    source: OPENROUTER_MODELS_URL,
    fetchedAt: now,
    totalModels: payload.data.length,
    freeModelCount: free.length,
    quotaPolicy: QUOTA_POLICY,
    models: free,
  };
}

/** 编排：拉接口 → 解析 → 可选查账号当日余量 → 产出「路径 → 文本」（不落盘，落盘交给 CLI，与 run.mjs 同形）。 */
export async function crawlOpenRouter({ fetchImpl = globalThis.fetch, now = new Date().toISOString(), apiKey = "" } = {}) {
  const res = await fetchImpl(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`openrouter /models HTTP ${res.status}`);
  const text = await res.text();
  const doc = parseFreeModels(JSON.parse(text), { now });
  // 指纹是「整份原始响应」的哈希（含 464 个付费模型），不是免费清单的哈希：
  // 实测 2026-09-30 两次抓取间隔 40 分钟，指纹变了而新增/下架均为 0——上游动的是别家的条目。
  // 所以它当「本次快照可追溯到哪份响应」用，判断免费清单有没有变要看 delta。
  // 另注：fetchedAt 每次抓取必然前进 ⇒ 抓成功就必是一份新台账，服务器上的 job 每天会落一条提交。
  doc.sourceFingerprint = createHash("sha256").update(text).digest("hex").slice(0, 16);

  // 有 key 才查真实余量；无 key 就整个字段不出现，绝不写占位值冒充「已查过」
  if (apiKey) {
    const k = await fetchImpl(OPENROUTER_KEY_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (k.ok) {
      const f = (await k.json())?.data?.free_model_daily_requests;
      if (f && typeof f === "object") doc.accountQuota = { used: f.used ?? null, limit: f.limit ?? null, remaining: f.remaining ?? null };
    } else {
      doc.accountQuotaError = `GET /api/v1/key HTTP ${k.status}`;
    }
  }

  return { doc, files: { "data/openrouter.json": JSON.stringify(doc, null, 2) + "\n" } };
}

/* 底部 CLI：真 fs/env 接线（与 run.mjs 同形）。刻意没有任何 git 操作——本机任务只更新工作区文件，
 * 提交与上线由人工决定（data/openrouter.json 一旦入库，deploy 的 quality job 才会构建到它）。 */
async function main() {
  const root = process.cwd();
  let summary;
  try {
    summary = await crawlOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY || "" });
  } catch (e) {
    // fail-stop：报错退出，旧文件保持不动（宁要昨天的真数据，不要今天的空数据）
    console.error(`openrouter 抓取中止：${e.message}（data/openrouter.json 未改动）`);
    process.exitCode = 1;
    return;
  }
  const { doc, files } = summary;
  const rel = "data/openrouter.json";
  const abs = path.resolve(root, rel);
  let delta = "首次抓取";
  if (existsSync(abs)) {
    try {
      const prev = JSON.parse(readFileSync(abs, "utf8"));
      const before = new Set((prev.models || []).map((m) => m.id));
      const nowIds = new Set(doc.models.map((m) => m.id));
      const added = doc.models.filter((m) => !before.has(m.id)).map((m) => m.id);
      const removed = [...before].filter((id) => !nowIds.has(id));
      delta = `新增 ${added.length} · 下架 ${removed.length}${added.length ? `（+${added.join(", ")}）` : ""}${removed.length ? `（-${removed.join(", ")}）` : ""}`;
      // 额度口径写在代码里（接口不返回），所以「变了」只可能是有人改了常量——值得在日志里吼一声
      if (prev.quotaPolicy && JSON.stringify(prev.quotaPolicy) !== JSON.stringify(doc.quotaPolicy)) delta += " · 额度口径常量已变更";
    } catch {
      delta = "旧文件不可解析，整份覆盖";
    }
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  // 先写临时名再原子替换：抓取中途被断电/杀掉不会留下半截 JSON 污染下一次 diff
  writeFileSync(abs + ".tmp", files[rel]);
  renameSync(abs + ".tmp", abs);
  console.log(`openrouter 完成：免费 ${doc.freeModelCount}/${doc.totalModels} · ${delta} · 指纹 ${doc.sourceFingerprint}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

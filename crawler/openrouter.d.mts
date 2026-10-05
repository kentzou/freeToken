/** crawler/openrouter.mjs 的类型声明（仅供 tsc 与测试消费，运行时零影响；与 adapt/clean/extract.d.mts 同规矩）。
 *  只声明有类型的三处：doc 的可选键必须写出来，否则 accountQuota/sourceFingerprint 这类「按需追加」的字段在测试里读不到。 */
export interface OpenRouterQuotaPolicy {
  source: string;
  scope: "account";
  perModelAllocation: null;
  appliesTo: string;
  requestsPerMinute: number;
  creditsThreshold: number;
  requestsPerDay: { lessThanCreditsThreshold: number; atLeastCreditsThreshold: number };
  reset: string;
  note: string;
  /** 恒为 false：/api/v1/models 不返回额度数值，这几个数是代码常量，抓取发现不了上游改政策 */
  scraped: boolean;
  verifiedAt: string;
}

export interface OpenRouterFreeModel {
  id: string;
  name: string;
  freeVariant: boolean;
  tokenPriceZero: boolean;
  quotaRef: "quotaPolicy";
  contextLength: number | null;
  maxCompletionTokens: number | null;
  modality: string | null;
  moderated: boolean | null;
}

export interface OpenRouterDoc {
  source: string;
  fetchedAt: string;
  totalModels: number;
  freeModelCount: number;
  quotaPolicy: OpenRouterQuotaPolicy;
  models: OpenRouterFreeModel[];
  sourceFingerprint?: string;
  /** 仅当传入 OPENROUTER_API_KEY 才出现：当日真实余量（GET /api/v1/key → free_model_daily_requests） */
  accountQuota?: { used: number | null; limit: number | null; remaining: number | null };
  accountQuotaError?: string;
}

export const OPENROUTER_MODELS_URL: string;
export const OPENROUTER_KEY_URL: string;
export const OPENROUTER_LIMITS_DOC: string;
export const QUOTA_POLICY: OpenRouterQuotaPolicy;

export function parseFreeModels(payload: unknown, opts: { now: string }): OpenRouterDoc;
export function crawlOpenRouter(opts?: {
  fetchImpl?: (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }>;
  now?: string;
  apiKey?: string;
}): Promise<{ doc: OpenRouterDoc; files: Record<string, string> }>;

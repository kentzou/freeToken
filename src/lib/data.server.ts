import { readFileSync } from "node:fs";
import path from "node:path";
import { compiledRules, type CompiledRules } from "./rules";
import type { IgetokenLedger, MetaJson, OpenRouterLedger, RulesJson, SiteConfig, TokenCard, WatchItem } from "./types";

/** 构建期一次性读取 JSON（静态导出，无运行时请求） */
function readJson<T>(rel: string): T {
  const file = path.resolve(process.cwd(), rel);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (e) {
    throw new Error(`数据文件读取失败：${rel}（${(e as Error).message}）`);
  }
}

/** OpenRouter 台账缺席时的最小空台账：字段齐但无数据。
 *  与 readJson 的严格抛错不同——openrouter 是新增的第二数据源，CI 的 quality job
 *  可能在首份台账入库前就构建过，构建不得因它缺席而红（tokens 等首数据源仍走严格语义）。 */
export const EMPTY_OPENROUTER_LEDGER: OpenRouterLedger = {
  source: "",
  fetchedAt: "",
  totalModels: 0,
  freeModelCount: 0,
  quotaPolicy: {
    source: "",
    scope: "account",
    perModelAllocation: null,
    appliesTo: "",
    requestsPerMinute: 0,
    creditsThreshold: 0,
    requestsPerDay: { lessThanCreditsThreshold: 0, atLeastCreditsThreshold: 0 },
    reset: "",
    note: "",
    scraped: false,
    verifiedAt: "",
  },
  models: [],
};

/** OpenRouter 台账的宽容读取：文件缺失或 JSON 损坏 → 空台账（只吞本文件的异常，
 *  其它数据源照常严格抛错）。cwd 参数可注入，测试指向临时目录即可覆盖缺席分支。 */
export function readOpenRouterLedger(cwd: string = process.cwd()): OpenRouterLedger {
  try {
    const ledger = JSON.parse(readFileSync(path.resolve(cwd, "data/openrouter.json"), "utf8")) as OpenRouterLedger;
    // 形态守卫与抓取侧 fail-stop 同向：缺关键字段视为未入库，退回空台账而不是渲染半份数据
    if (!ledger || !Array.isArray(ledger.models) || typeof ledger.freeModelCount !== "number") {
      return EMPTY_OPENROUTER_LEDGER;
    }
    return ledger;
  } catch {
    return EMPTY_OPENROUTER_LEDGER;
  }
}

/** iGetoken 快讯台账缺席时的最小空台账：与 openrouter 同一宽容语义——
 *  第三数据源缺席不得染红构建（首份台账入库前的 quality job 照样能过）。 */
export const EMPTY_IGETOKEN_LEDGER: IgetokenLedger = {
  source: "",
  sourceName: "iGetoken 活动快讯",
  rightsNote: "本站仅登记标题与原文链接，正文版权归原作者；点击标题跳转 iGetoken 阅读。",
  fetchedAt: "",
  itemCount: 0,
  items: [],
};

/** 宽容读取（与 readOpenRouterLedger 同律）：缺失/损坏/形态不合 → 空台账，其它数据源照常严格。 */
export function readIgetokenLedger(cwd: string = process.cwd()): IgetokenLedger {
  try {
    const ledger = JSON.parse(readFileSync(path.resolve(cwd, "data/igetoken-deals.json"), "utf8")) as IgetokenLedger;
    if (!ledger || !Array.isArray(ledger.items) || typeof ledger.itemCount !== "number") {
      return EMPTY_IGETOKEN_LEDGER;
    }
    return ledger;
  } catch {
    return EMPTY_IGETOKEN_LEDGER;
  }
}

export interface Catalog {
  cards: TokenCard[];
  donots: WatchItem[];
  rules: RulesJson;
  compiled: CompiledRules;
  meta: MetaJson;
  config: SiteConfig;
  openrouter: OpenRouterLedger;
  igetoken: IgetokenLedger;
}

let cache: Catalog | null = null;

export function loadCatalog(): Catalog {
  if (cache) return cache;
  cache = {
    cards: readJson<TokenCard[]>("data/tokens.json"),
    donots: readJson<WatchItem[]>("data/donots.json"),
    rules: readJson<RulesJson>("data/rules.json"),
    compiled: compiledRules(readJson<RulesJson>("data/rules.json")),
    meta: readJson<MetaJson>("data/meta.json"),
    config: readJson<SiteConfig>("config/site-config.json"),
    openrouter: readOpenRouterLedger(),
    igetoken: readIgetokenLedger(),
  };
  return cache;
}

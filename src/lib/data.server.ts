import { readFileSync } from "node:fs";
import path from "node:path";
import { compiledRules, type CompiledRules } from "./rules";
import type { MetaJson, RulesJson, SiteConfig, TokenCard, WatchItem } from "./types";

/** 构建期一次性读取 JSON（静态导出，无运行时请求） */
function readJson<T>(rel: string): T {
  const file = path.resolve(process.cwd(), rel);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (e) {
    throw new Error(`数据文件读取失败：${rel}（${(e as Error).message}）`);
  }
}

export interface Catalog {
  cards: TokenCard[];
  donots: WatchItem[];
  rules: RulesJson;
  compiled: CompiledRules;
  meta: MetaJson;
  config: SiteConfig;
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
  };
  return cache;
}

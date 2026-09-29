/** 种子数据导出：上游 data.json 快照 + 本地视图 → data/*.json（爬虫 run.mjs 复用同一条管线）。
 *  buildSeed 为纯函数（只算不写盘），crawler/run.mjs 直接 import，杜绝复制粘贴漂移；
 *  本文件被直接执行时（npm run seed）走底部 CLI 分支。
 *  计划 2.5 换血：上游只提供事实 7 键（决策 Q1），观点字段（rating/effect/signup/pin/alwaysShow/
 *  badge/tone/extraAction/v2）全部从上一次的本地产物继承；规则表与观望名单转为本地固定资产
 *  （决策 Q5/Q4），buildSeed 原样透传，不再从上游提取。 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractDataJson } from "../crawler/extract.mjs";
import { adaptItems } from "../crawler/adapt.mjs";
import { applySiteConfig, cleanCard, linkRisk } from "../crawler/clean.mjs";

const OUT = path.resolve(process.cwd(), "data");
const CFG = path.resolve(process.cwd(), "config", "site-config.json");
/** CLI 与 seed:repro 的输入源：上游 data.json 的真实快照。
 *  CI 里既不联网，也不依赖 ../token-fbi 镜像（镜像已过期，上游 app.js 更已下线）。 */
const SNAPSHOT = path.resolve(process.cwd(), "tests", "fixtures", "upstream-data.json");

/** 稳定序列化：键序固定 + 2 空格缩进，保证同输入同产物 */
export function dump(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/** 读本地三件套（观点基底 + 两张透传表）。缺文件返回 null，由 buildSeed 决定如何报错。 */
export function loadLocal() {
  const read = (rel) => {
    const abs = path.resolve(process.cwd(), "data", rel);
    return existsSync(abs) ? JSON.parse(readFileSync(abs, "utf8")) : null;
  };
  return { cards: read("tokens.json"), donots: read("donots.json"), rules: read("rules.json") };
}

/** 管线核心：上游 data.json 文本 + site-config（可为 null，表示无覆盖）+ 本地视图 → 四份出参。
 *  不触碰文件系统，调用方自行落盘；校验（绝不带病入库）统一排在 applySiteConfig 之后。 */
export function buildSeed(sourceText, config, local) {
  const { items } = extractDataJson(sourceText);
  const { prevCards, prevDonots, prevRules } = {
    prevCards: (local || {}).cards,
    prevDonots: (local || {}).donots,
    prevRules: (local || {}).rules,
  };
  /* 三条 fail-stop 护栏——本地基底缺失时绝不静默降级：
     缺 tokens.json 会把整站观点字段（评分/上手指南/pin）抹平；缺 donots/rules 会让
     观望剔除与门槛规则/slug 全线失效。宁可停下让人补快照，也不能发布「看起来正常」的空壳。 */
  if (!Array.isArray(prevCards) || prevCards.length === 0) {
    throw new Error("本地快照缺失：buildSeed 需要上一次的 data/tokens.json 作观点字段基底（决策 Q1）");
  }
  if (!Array.isArray(prevDonots)) {
    throw new Error("本地快照缺失：观望名单已转本地维护，需要 data/donots.json（决策 Q4）");
  }
  if (!prevRules || typeof prevRules !== "object" || Array.isArray(prevRules)) {
    throw new Error("本地快照缺失：规则表已转本地固定资产，需要 data/rules.json（决策 Q5）");
  }

  const cleaned = adaptItems(items, prevCards).map(cleanCard);
  const merged = applySiteConfig(cleaned, prevDonots, config);

  /* 校验必须排在 applySiteConfig 之后：清洗器先剥参数，逐卡覆盖兜住路径型短链，两层都跑完
     再判定，才不会把「配置一改就干净」的卡误报（实测 LobsterAI 即属此类）。
     一次性列全风险卡，避免「改一处跑一次」；绝不带病入库。 */
  const bad = [];
  for (const card of [...merged.cards, ...merged.donots]) {
    for (const [field, url] of [
      ["link", card.link],
      ["extraAction.link", card.extraAction && card.extraAction.link],
    ]) {
      const risk = linkRisk(url);
      if (risk) bad.push(`${card.name}·${field}：${risk} → ${url}`);
    }
  }
  if (bad.length) throw new Error(`清洗失败（绝不带病入库）：\n  ${bad.join("\n  ")}`);

  /* 上游原文的 sha256 前 16 位，作为本地种子的「来源指纹」；爬虫侧会被 commit SHA 覆盖 meta.lastSyncedSha。 */
  const now = new Date();
  return {
    cards: merged.cards,
    donots: merged.donots,
    rules: prevRules,
    meta: {
      lastSyncedSha: null,
      lastSyncedAt: now.toISOString(),
      sourceFingerprint: createHash("sha256").update(sourceText).digest("hex").slice(0, 16),
      counts: { tokens: merged.cards.length, donots: merged.donots.length },
    },
  };
}

/** CLI：仅在被 `node scripts/export-seed.mjs` 直接执行时运行。
 *  用 pathToFileURL(resolve(argv[1])) 比较，Windows 反斜杠路径同样命中（import.meta.url 恒为正斜杠 file URL）。 */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let config = null;
  try {
    config = JSON.parse(readFileSync(CFG, "utf8"));
  } catch (e) {
    console.warn("[seed] site-config 读取失败，按无覆盖处理：", e.message);
  }

  const seed = buildSeed(readFileSync(SNAPSHOT, "utf8"), config, loadLocal());

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "tokens.json"), dump(seed.cards));
  writeFileSync(path.join(OUT, "donots.json"), dump(seed.donots));
  writeFileSync(path.join(OUT, "rules.json"), dump(seed.rules));
  writeFileSync(path.join(OUT, "meta.json"), dump(seed.meta));

  console.log(`seed 完成：tokens=${seed.cards.length} donots=${seed.donots.length}`);
}

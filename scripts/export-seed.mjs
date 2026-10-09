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
import { dump } from "../crawler/serialize.mjs";
import { loadLocalCards, mergeLocalCards } from "../crawler/local-cards.mjs";

const OUT = path.resolve(process.cwd(), "data");
const CFG = path.resolve(process.cwd(), "config", "site-config.json");
/** CLI 与 seed:repro 的输入源：上游 data.json 的真实快照。
 *  CI 里既不联网，也不依赖 ../token-fbi 镜像（镜像已过期，上游 app.js 更已下线）。 */
const SNAPSHOT = path.resolve(process.cwd(), "tests", "fixtures", "upstream-data.json");

/** 读本地四件套（观点基底 + 两张透传表 + 本地增补卡原文）。
 *  缺 data/*.json 返回 null，由 buildSeed 决定如何报错；缺 config/local-cards.json 视为空表
 *  （本地增补是可选来源，不该因为没建文件就把整条管线停掉，spec §6.2）。 */
export function loadLocal() {
  const read = (rel) => {
    const abs = path.resolve(process.cwd(), "data", rel);
    return existsSync(abs) ? JSON.parse(readFileSync(abs, "utf8")) : null;
  };
  const cardsAbs = path.resolve(process.cwd(), "config", "local-cards.json");
  return {
    cards: read("tokens.json"),
    donots: read("donots.json"),
    rules: read("rules.json"),
    localCards: loadLocalCards(existsSync(cardsAbs) ? readFileSync(cardsAbs, "utf8") : ""),
  };
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
  /* 本地增补卡（计划 6）：合在 applySiteConfig **之前**，好让 hide / link / type 覆盖
     和 :69-79 那段逐卡 linkRisk 对两类卡一视同仁——不存在「本地卡不受后台与配置约束」的第二套语义。
     本地卡不过 cleanCard：它已是本站手写终值，再过一次会误删 sourceUrl（D-2）。
     同名一律本地让路（被上游接管，或被表内前一条接管，决策 #8）并出声；出声是给人看的，不是给 crawl 停的。 */
  const { cards: withLocal, warn } = mergeLocalCards(cleaned, (local || {}).localCards || []);
  if (warn.length) console.warn("[local-cards] 本地条目未落地（与上游卡或表内前一条同名）：", warn.join("、"));
  /* 收取下限：三条基底护栏只挡在 adapt 之前，挡不住「上游类目字段整体改名」。
     触发条件就是字面意义上的收取数归零（items 非空、解析成功，但 adaptItems 一条不收），
     没有这道闸就会把 32 张卡的评分/上手指南/pin 静默抹成空表落盘（seed:repro 的「管线=磁盘」
     陈旧红线此时自洽通过，救不了）。只挡全量归零：部分掉卡属决策 Q2 的正常跟随下架，
     交给 CLI 的降幅告警出声，硬拦反而会让合法下架跑不过去。 */
  if (!cleaned.length) {
    throw new Error(
      "上游 items 非空但适配层收取数为 0（决策 Q7 只认 tool/model、Q6 挡 sponsored）：疑似上游类目字段改名或形态漂移，拒绝导出空表（决策 Q1 基底保护）"
    );
  }
  const merged = applySiteConfig(withLocal, prevDonots, config);

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

/** 落盘前的非致命降幅告警文案（纯函数，用例直测；是否出声由 CLI 决定）。
 *  下限闸只挡「收取数归零」；部分掉卡是决策 Q2 的正常跟随下架，不能硬拦。但事实是
 *  观点字段（rating/effect/signup/pin/badge/tone/extraAction/v2）不可由管线重建，
 *  一次误覆写只能靠 git 回溯，所以降幅超阈值时必须出声。
 *  base 非正数时返回 null：基底为空的情况 buildSeed 已先抛，不该再叠一条噪音。 */
export function dropWarning(baseCount, nextCount, threshold = 0.2) {
  if (!Number.isFinite(baseCount) || baseCount <= 0) return null;
  const drop = (baseCount - nextCount) / baseCount;
  if (drop <= threshold) return null;
  return `卡片数 ${baseCount}→${nextCount}（降幅 ${Math.round(drop * 100)}%）：若非有意下架，请勿提交——观点字段不可由管线重建，误覆写只能 git 回溯`;
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

  const local = loadLocal();
  const seed = buildSeed(readFileSync(SNAPSHOT, "utf8"), config, local);
  const warn = dropWarning(local.cards && local.cards.length, seed.cards.length);
  if (warn) console.warn(`[seed] ${warn}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "tokens.json"), dump(seed.cards));
  writeFileSync(path.join(OUT, "donots.json"), dump(seed.donots));
  writeFileSync(path.join(OUT, "rules.json"), dump(seed.rules));
  writeFileSync(path.join(OUT, "meta.json"), dump(seed.meta));

  console.log(`seed 完成：tokens=${seed.cards.length} donots=${seed.donots.length}`);
}

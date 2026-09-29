/** 种子数据导出：镜像源码 → 提取 → 清洗 → site-config 覆盖 → data/*.json（阶段 D 爬虫复用同一路径）。
 *  buildSeed 为纯函数（只算不写盘），计划 2 的爬虫可直接 import 同一条管线，杜绝复制粘贴漂移；
 *  本文件被直接执行时（npm run seed）走模块底部的 CLI 分支，行为与产物保持逐字节一致。 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractStructures } from "../crawler/extract.mjs";
import { applySiteConfig, cleanCard, linkRisk } from "../crawler/clean.mjs";

const MIRROR = path.resolve(process.cwd(), "..", "token-fbi", "app.js");
const OUT = path.resolve(process.cwd(), "data");
const CFG = path.resolve(process.cwd(), "config", "site-config.json");

/** 稳定序列化：键序固定 + 2 空格缩进，保证同输入同产物 */
function dump(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/** 管线核心：镜像源码文本 + site-config（可为 null，表示无覆盖）→ 四份出参数据。
 *  不触碰文件系统，调用方自行落盘；校验（绝不带病入库）在 applySiteConfig 之后统一做。 */
export function buildSeed(mirrorSrcText, config) {
  const x = extractStructures(mirrorSrcText);

  const cleaned = x.TOKENS.map(cleanCard);
  const cleanedDonots = x.DONOTS.map((d) => ({ ...d, link: cleanCard(d).link }));
  const merged = applySiteConfig(cleaned, cleanedDonots, config);

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

  /* 上游镜像文本的 sha256 前 16 位，作为本地种子的「来源指纹」；阶段 D 换成 commit SHA。
     与旧版 fileSha(镜像文件) 等值：utf8 文本的哈希即文件字节的哈希。 */
  const now = new Date();
  return {
    cards: merged.cards,
    donots: merged.donots,
    rules: {
      featured: x.FEATURED_RULES,
      logo: x.LOGO_RULES,
      cardCopy: x.CARD_COPY_RULES,
      detailSlug: x.DETAIL_SLUG_RULES,
      regionByName: x.REGION_BY_NAME,
    },
    meta: {
      lastSyncedSha: null,
      lastSyncedAt: now.toISOString(),
      sourceFingerprint: createHash("sha256").update(mirrorSrcText).digest("hex").slice(0, 16),
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

  const seed = buildSeed(readFileSync(MIRROR, "utf8"), config);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "tokens.json"), dump(seed.cards));
  writeFileSync(path.join(OUT, "donots.json"), dump(seed.donots));
  writeFileSync(path.join(OUT, "rules.json"), dump(seed.rules));
  writeFileSync(path.join(OUT, "meta.json"), dump(seed.meta));

  console.log(`seed 完成：tokens=${seed.cards.length} donots=${seed.donots.length}`);
}

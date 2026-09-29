/** 种子数据导出：镜像源码 → 提取 → 清洗 → site-config 覆盖 → data/*.json（阶段 D 爬虫复用同一路径） */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractStructures } from "../crawler/extract.mjs";
import { applySiteConfig, cleanCard, linkRisk } from "../crawler/clean.mjs";

const MIRROR = path.resolve(process.cwd(), "..", "token-fbi", "app.js");
const OUT = path.resolve(process.cwd(), "data");
const CFG = path.resolve(process.cwd(), "config", "site-config.json");

/** 上游镜像文件的 sha256，作为本地种子的「来源指纹」；阶段 D 换成 commit SHA */
function fileSha(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CFG, "utf8"));
  } catch (e) {
    console.warn("[seed] site-config 读取失败，按无覆盖处理：", e.message);
    return null;
  }
}

/** 稳定序列化：键序固定 + 2 空格缩进，保证同输入同产物 */
function dump(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

const src = readFileSync(MIRROR, "utf8");
const x = extractStructures(src);

const cleaned = x.TOKENS.map(cleanCard);
const cleanedDonots = x.DONOTS.map((d) => ({ ...d, link: cleanCard(d).link }));
const merged = applySiteConfig(cleaned, cleanedDonots, readConfig());

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

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "tokens.json"), dump(merged.cards));
writeFileSync(path.join(OUT, "donots.json"), dump(merged.donots));
writeFileSync(
  path.join(OUT, "rules.json"),
  dump({
    featured: x.FEATURED_RULES,
    logo: x.LOGO_RULES,
    cardCopy: x.CARD_COPY_RULES,
    detailSlug: x.DETAIL_SLUG_RULES,
    regionByName: x.REGION_BY_NAME,
  })
);
const now = new Date();
writeFileSync(
  path.join(OUT, "meta.json"),
  dump({
    lastSyncedSha: null,
    lastSyncedAt: now.toISOString(),
    sourceFingerprint: fileSha(MIRROR).slice(0, 16),
    counts: { tokens: merged.cards.length, donots: merged.donots.length },
  })
);

console.log(`seed 完成：tokens=${merged.cards.length} donots=${merged.donots.length}`);

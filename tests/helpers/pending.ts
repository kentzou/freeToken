/** 用仓库真实数据造 pending：条目形状只由 crawler/diff.mjs 产出，测试不手搓形状（形状漂了这里先红）。
 *  四种真实形态各一条：卡片改字段 / 观望项改 why / 规则表整表变更 / 卡片删除。
 *  为什么非要凑够四种：`applyDecisions` 有 card 改、card 删、watch、rules 四条分支，`toRows` 有
 *  card/watch/rules 三种标签口径；且 approve all 时三张数据表全脏，Task 5 的「第二个文件 409」
 *  才有一次真实的部分失败可测（只脏 cards.json 时，卡片写完就没得再写）。
 *  重要事实：真实 pending 里不会出现「新增」条目——新增是自动发布的
 *  （run.mjs 的 syncOnce 只把 changed+removed 并入队列），原型 Tab1 那张「新增」卡属演示形态，已登记给计划 4。 */
import { readFileSync } from "node:fs";
import { diffAll } from "../../crawler/diff.mjs";

const read = (rel: string) => JSON.parse(readFileSync(`data/${rel}`, "utf8"));

/** 造 pending 用的两个「真实坐标」：被删的那条 = tokens.json 的真实末条，被改的观望项 = donots.json 的真实首条。
 *  从数据派生而不是写死卡名：crawler 每 6 小时加卡就会换掉末条，写死会让 admin-pending / admin-publish
 *  的 id 断言随数据增长必然假红（本轮 13 条红灯里两条的直接根因）。派生后「期望值来自 data/*.json 的
 *  数组末位/首位」，数据增长不再影响这些断言，但下面每条用例对 diffAll 产出形态的校验一条没减。 */
const CARDS_FOR_ANCHOR = read("tokens.json");
const DONOTS_FOR_ANCHOR = read("donots.json");
export const DROPPED: string = CARDS_FOR_ANCHOR[CARDS_FOR_ANCHOR.length - 1].name;
export const WATCHED: string = DONOTS_FOR_ANCHOR[0].name;

export function realData() {
  return { cards: read("tokens.json"), donots: read("donots.json"), rules: read("rules.json") };
}

export function realPending() {
  const { cards, donots, rules } = realData();
  const meta = read("meta.json");
  const touched = cards.map((c: any) => (c.name === "WorkBuddy" ? { ...c, quota: `${c.quota}（核验续期）` } : c));
  const watched = donots.map((w: any) => (w.name === WATCHED ? { ...w, why: `${w.why}（复核补充）` } : w));
  const next = { cards: touched.slice(0, -1), donots: watched, rules: { ...rules, featured: rules.featured.slice(0, -1) } };
  /** prev 必须是未改动的原表：拿 touched 当 prev，WorkBuddy 两边同值 → 差异为 0，fixture 直接失去「修改」这一形态 */
  const d = diffAll({ cards, donots, rules }, next);
  return {
    version: 1,
    upstreamSha: meta.sourceFingerprint ?? null, // 真实指纹，不编造 sha
    detectedAt: meta.lastSyncedAt,
    changes: [...d.changed, ...d.removed],
  };
}

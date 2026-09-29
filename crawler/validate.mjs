/** 写入侧校验：爬虫入库与审批合入前的最后一道闸（绝不带病入库的管线形态）。
 *  判定与 seed 完全同源（linkRisk 单一实现），只是错误信息与「时机」不同：seed 在导出前抛，
 *  这里在每一次覆盖 data/*.json 之前抛。run.mjs 与 approve.mjs 共用，禁止另写。 */
import { linkRisk } from "./clean.mjs";

export function validateCards(cards) {
  const bad = [];
  for (const card of cards || []) {
    for (const [field, url] of [
      ["link", card.link],
      ["extraAction.link", card.extraAction && card.extraAction.link],
    ]) {
      const risk = linkRisk(url);
      if (risk) bad.push(`${card.name}·${field}：${risk}`);
    }
  }
  if (bad.length) throw new Error(`卡片校验失败（拒绝写盘）：\n  ${bad.join("\n  ")}`);
  return cards;
}

export function validateRulesJson(rules) {
  const bad = [];
  const check = (list, where) => {
    (list || []).forEach((r, i) => {
      try {
        new RegExp(r.source, r.flags);
      } catch (e) {
        bad.push(`${where}#${i}：source=${r.source} flags=${r.flags}（${e.message}）`);
      }
    });
  };
  check(rules?.featured, "rules.featured");
  check(rules?.logo, "rules.logo");
  check(rules?.cardCopy, "rules.cardCopy");
  check(rules?.detailSlug, "rules.detailSlug");
  if (!rules || typeof rules.regionByName !== "object" || rules.regionByName === null) {
    bad.push("rules.regionByName 缺失或不是对象");
  }
  if (bad.length) throw new Error(`规则校验失败（拒绝写盘）：\n  ${bad.join("\n  ")}`);
  return rules;
}

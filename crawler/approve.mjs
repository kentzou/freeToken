/** /approve //reject 合入（spec §7.6 + 无 JS 降级冗余的设计主干）：纯函数。
 *  workflow 的 review job 与计划 3 /admin 都调它——「批准并发布」全站只有一种语义。 */
import { keyOf } from "./diff.mjs";
import { validateCards, validateRulesJson } from "./validate.mjs";

export function applyDecisions({ pending, cards, donots, rules }, decisions) {
  const byKey = new Map((pending?.changes || []).map((e) => [keyOf(e), e]));
  let nextCards = (cards || []).map((c) => ({ ...c }));
  let nextDonots = (donots || []).map((w) => ({ ...w }));
  const nextRules = JSON.parse(JSON.stringify(rules || {}));
  const applied = [];
  const missing = [];

  for (const { id, action } of decisions || []) {
    const e = byKey.get(id);
    if (!e) {
      missing.push(id);
      continue;
    }
    if (action === "approve") {
      if (e.kind === "card") {
        if (e.after) {
          const i = nextCards.findIndex((c) => c.name === e.name);
          if (i > -1) nextCards[i] = e.after;
          else nextCards.push(e.after);
        } else {
          nextCards = nextCards.filter((c) => c.name !== e.name);
        }
      } else if (e.kind === "watch") {
        if (e.after) {
          const i = nextDonots.findIndex((w) => w.name === e.name);
          if (i > -1) nextDonots[i] = e.after;
          else nextDonots.push(e.after);
        } else {
          nextDonots = nextDonots.filter((w) => w.name !== e.name);
        }
      } else {
        nextRules[e.name] = e.after; // rules 条目：name 即表名，after 为整表
      }
    }
    // reject：维持现库值不动——修改/删除在持旧期本就不生效
    applied.push({ id, action });
  }

  validateCards(nextCards);
  validateRulesJson(nextRules);
  const done = new Set(applied.map((a) => a.id));
  const rest = (pending?.changes || []).filter((e) => !done.has(keyOf(e)));
  return {
    data: { cards: nextCards, donots: nextDonots, rules: nextRules },
    pending: { ...(pending || { version: 1 }), changes: rest },
    applied,
    missing,
  };
}

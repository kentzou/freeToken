/** 三分类比对（spec §7.5）：按 name 键逐字段 diff。纯函数——不碰 fs/网络/时间。
 *  规则表按「整表」比对：条目携带 before/after 全量，审批合入时直接整表替换，
 *  不做逐条正则 diff（序列化规则表本就小，读得懂的审核 > 花哨的合并）。 */

export const keyOf = (e) => `${e.kind}:${e.name}`;

/** kind 的中文口径唯一实现：Issue 正文（crawler/run.mjs）与后台待审队列（src/lib/admin/pending.ts）共用，
 *  禁止任何一侧再写三元——写了就会漂出「Issue 里叫情报卡、后台里叫卡片」这类同物异名。 */
export function kindLabel(kind) {
  return kind === "card" ? "情报卡" : kind === "watch" ? "观望项" : "规则表";
}

/** 「删除」判定唯一口径：diffKeyedList 产出 removed 时固定 after:null，故 null/undefined 即删除。
 *  不写 `!after`——将来若出现 after:0 或 after:"" 会被误判成删除（删除是最重的动作，误判代价最高）。 */
export function isRemoval(e) {
  return e?.after === null || e?.after === undefined;
}

/** 差异字段展示上限：Issue 正文与后台表格同一个数，两边读到的条数差会被运维当成 bug 查 */
export const FIELD_LIMIT = 20;

function byName(list) {
  const m = new Map();
  (list || []).forEach((x) => {
    if (x && typeof x.name === "string") m.set(x.name, x);
  });
  return m;
}

/** undefined 与 null 视为同值：JSON 存储本就把 undefined 折成「键不存在」 */
function fieldDiffs(before, after) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
  const fields = [];
  for (const k of keys) {
    const a = JSON.stringify(before?.[k] ?? null);
    const b = JSON.stringify(after?.[k] ?? null);
    if (a !== b) fields.push({ field: k, from: before?.[k] ?? null, to: after?.[k] ?? null });
  }
  return fields;
}

function diffKeyedList(kind, prev, next) {
  const pm = byName(prev);
  const nm = byName(next);
  const added = [];
  const changed = [];
  const removed = [];
  for (const [name, after] of nm) {
    const before = pm.get(name) ?? null;
    if (!before) added.push({ kind, name, before: null, after, fields: [{ field: "(整条)", from: null, to: "新增" }] });
    else {
      const fields = fieldDiffs(before, after);
      if (fields.length) changed.push({ kind, name, before, after, fields });
    }
  }
  for (const [name, before] of pm) {
    if (!nm.has(name)) removed.push({ kind, name, before, after: null, fields: [{ field: "(整条)", from: "存在", to: null }] });
  }
  return { added, changed, removed };
}

const RULE_TABLES = ["featured", "logo", "cardCopy", "detailSlug", "regionByName"];

function diffRules(prev, next) {
  const changed = [];
  for (const t of RULE_TABLES) {
    const a = JSON.stringify(prev?.[t] ?? null);
    const b = JSON.stringify(next?.[t] ?? null);
    if (a !== b) {
      changed.push({ kind: "rules", name: t, before: prev?.[t] ?? null, after: next?.[t] ?? null, fields: [{ field: t, from: "(整表，见 before)", to: "(整表，见 after)" }] });
    }
  }
  return changed;
}

export function diffAll(prev, next) {
  const cards = diffKeyedList("card", prev.cards, next.cards);
  const donots = diffKeyedList("watch", prev.donots, next.donots);
  return {
    added: [...cards.added, ...donots.added],
    changed: [...cards.changed, ...donots.changed, ...diffRules(prev.rules, next.rules)],
    removed: [...cards.removed, ...donots.removed],
  };
}

export function hasChanges(diff) {
  return diff.added.length + diff.changed.length + diff.removed.length > 0;
}

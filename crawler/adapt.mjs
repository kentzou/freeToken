/** 上游 data.json items → 本站卡片：事实/观点分层合并 + 三重挡架（决策 Q1/Q2/Q6/Q7/Q9）。
 *  事实层 = 上游每轮刷新的 7 键；观点层 = 其余本地手写键（rating/effect/signup/pin/alwaysShow/badge/tone/extraAction/v2），
 *  上游已无载体，故只从本地旧卡继承，绝不被覆盖或清空。
 *  本文件是上游字段的唯一读取入口：export-seed 与爬虫都 import 这里，禁止在别处再写一套。 */

/** 上游改名 → 本站卡名 alias（键=上游现名，值=本站定名）。
 *  Qoder 灵码在上游从「阿里云 Qoder（灵码）」漂到「Qoder cn」：不打 alias，
 *  diff 会拆成「删除 + 新增」，本地 rating/effect/extraAction 等观点字段随之丢失。 */
export const NAME_ALIAS = { "Qoder cn": "阿里云 Qoder（灵码）" };

/** 上游 category → 本站 type；未列出者（event/未知类目）直接不收（决策 Q7）。 */
export const CATEGORY_TO_TYPE = { tool: "工具", model: "大模型" };

/** 事实白名单：只有这 7 个键允许覆盖本地卡，其余键一律视为观点层（决策 Q1）。
 *  顺序同时是「本地无旧卡」时的落盘键序，保证幂等。 */
export const FACT_FIELDS = ["name", "type", "modality", "quota", "link", "limited", "updated"];

/** 单条上游 item → 事实补丁；返回 null 表示不收（无名 / 赞助广告卡 / 类目未认）。
 *  查表一律走 hasOwn：上游是可外部改写的 JSON，`category:"toString"` 之类的原型键
 *  若用裸下标会被当成命中（值为 function，JSON.stringify 时整键消失 → 落盘卡缺键，
 *  破坏 FACT_FIELDS 键序不变量）。本仓 [site-config] 的 constructor 告警是同一课。 */
export function adaptItem(item) {
  if (!item || typeof item.name !== "string" || !item.name.trim()) return null;
  if (item.sponsored === true) return null; // 决策 Q6：sponsored 与 ad_* 系广告位不进报纸
  const type = Object.hasOwn(CATEGORY_TO_TYPE, item.category) ? CATEGORY_TO_TYPE[item.category] : undefined;
  if (!type) return null; // 决策 Q7：只认 tool/model，event/未知类目丢弃
  return {
    name: (Object.hasOwn(NAME_ALIAS, item.name) ? NAME_ALIAS[item.name] : undefined) || item.name,
    type,
    modality: item.modality || "",
    quota: item.quota || "",
    link: item.entry_url || item.intel_url || "",
    limited: item.validity || null,
    updated: item.last_verified || "",
  };
}

/** 事实补丁按 FACT_FIELDS 固定键序重建：本地基底 + 覆盖 → 连跑不漂移（seed:repro 的幂等红线靠它）。 */
function factPatch(facts) {
  const out = {};
  for (const k of FACT_FIELDS) out[k] = facts[k];
  return out;
}

/** 上游 items × 本地旧卡 → 按上游顺序的新卡数组。
 *  本地有对应卡 → 继承观点字段，只刷事实（决策 Q1）；
 *  上游有本地无 → 纯事实 7 键新卡（决策 Q8 新卡全收）；
 *  本地有上游无 → 自然出局（决策 Q2 跟随下架，绝不写进观望名单）。
 *  容器级脏输入（items/prevCards 不是数组）按空集处理不抛错：形态校验属 extract 层，
 *  这里只保证适配器自身永不因数据变形而抛裸 TypeError。 */
export function adaptItems(items, prevCards) {
  const list = Array.isArray(items) ? items : [];
  const base = Array.isArray(prevCards) ? prevCards : [];
  const byName = new Map(base.map((c) => [c.name, c]));
  const out = [];
  for (const item of list) {
    const facts = adaptItem(item);
    if (!facts) continue;
    const prev = byName.get(facts.name);
    out.push(prev ? { ...prev, ...factPatch(facts) } : factPatch(facts));
  }
  return out;
}

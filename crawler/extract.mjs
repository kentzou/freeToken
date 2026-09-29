/** 上游数据源提取（计划 2.5 起）：hope0719/token-fbi 已把结构体从 app.js 挪到独立的 data.json，
 *  本站不再对上游源码求值——本文件只剩「解析 + 形态守卫」。
 *  规则五表与观望名单已转本地固定资产（决策 Q5/Q4）；上游 retired 表在此层就被丢弃，
 *  绝不进入 donots（决策 Q4：retired 的语义只是「该卡从 items 里消失」，走既有删除审核队列）。 */

/** 解析上游 data.json 文本 → { items }。本层不改内容、不做过滤（过滤属 adapt 层）。
 *  三条形态守卫全部 fail-stop：宁可整轮爬取报错，也绝不能把「解析了一半」当成「上游清空了」——
 *  后者会让 diff 把全部卡片判为 removed，一次误报就抹掉整站内容。 */
export function extractDataJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`data.json 解析失败：${e.message}`);
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("data.json 形态异常：顶层不是对象");
  }
  if (!Array.isArray(json.items) || json.items.length === 0) {
    throw new Error("data.json 形态异常：items 缺失或为空");
  }
  return { items: json.items };
}

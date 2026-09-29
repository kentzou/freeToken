/** 测试专用上游注入器：所有「往 data.json 里加一条」的用例都走这里，
 *  禁止在各自测试里手写字符串拼接（格式一变即碎）。解析→改 items→按快照风格重序列化。
 *  实测 `JSON.stringify(JSON.parse(快照), null, 2)` 与 26377 B 快照逐字节相同（快照无结尾换行），
 *  故此处不补 `\n`：注入后的文本与原快照只差被注入的那一条，哈希级比对才有意义。 */
export function injectUpstreamItem(text: string, item: Record<string, unknown>): string {
  const json = JSON.parse(text);
  if (!Array.isArray(json?.items)) throw new Error("注入失败：文本不是含 items 数组的 data.json 形态");
  json.items.unshift(item);
  return JSON.stringify(json, null, 2);
}

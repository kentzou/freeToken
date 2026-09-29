/** 测试专用上游注入器：所有「往 data.json 里加一条」的用例都走这里，
 *  禁止在各自测试里手写字符串拼接（格式一变即碎）。解析→改 items→按快照风格重序列化。 */
export function injectUpstreamItem(text: string, item: Record<string, unknown>): string {
  const json = JSON.parse(text);
  json.items.unshift(item);
  return JSON.stringify(json, null, 2) + "\n";
}

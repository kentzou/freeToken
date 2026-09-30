/** 全站唯一的「对象 → 文件文本」出口 + Contents API 的 base64 编解码。
 *  为什么从 scripts/export-seed.mjs 搬出来：那里顶部 import node:crypto/node:fs，
 *  浏览器侧（计划 3 的 /admin 数据面）一 import 就炸构建。
 *  为什么只准有一处：管线落盘、review CLI 合入、/admin Contents 提交三条路径必须字节同源，
 *  否则 /admin 写回的格式差异会被下一轮 crawl 的 diff 读成「上游变更」。 */

/** 稳定序列化：键序即入参键序 + 2 空格缩进 + 结尾换行 */
export function dump(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/** UTF-8 安全的 base64 编码（分块 0x8000，避免 fromCharCode 展开实参爆栈） */
export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text));
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, [...bytes.subarray(i, i + 0x8000)]);
  return btoa(s);
}

/** 解码前吃掉所有空白：GitHub 的 content 折行口径变过两次，两种都要能读 */
export function decodeBase64Utf8(b64) {
  const clean = String(b64).replace(/\s+/g, "");
  const bin = atob(clean);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

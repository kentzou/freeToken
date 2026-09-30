/** adminLogins 比对与拒绝文案的唯一实现（§1 红线 1）。
 *  浏览器侧（src/lib/admin/auth.ts）与 CI 侧（Task 6 的 review job 闸门）必须调同一份。
 *  注意定位：这是「谁能用后台 / 谁能盖章」的意图闸，不是安全边界——真正的写入能力由 token scope 决定。 */

/** 名单文本 → 数组：半角/全角逗号与空白都当分隔符（配置页输入与 Issue 评论同一口径） */
export function parseLogins(text) {
  return String(text ?? "")
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** GitHub login 大小写不敏感 → 比对前双向归一；返回的 login 是 trim 后的原样值（展示与回执用它）。
 *  reason 四值供上层分文案：no_login（没身份）/ empty_allowlist（没名单，fail-closed）/ not_allowed / ok。 */
export function allowlistCheck({ login, logins } = {}) {
  const who = typeof login === "string" ? login.trim() : "";
  if (!who) return { ok: false, reason: "no_login", login: "" };
  const list = Array.isArray(logins) ? logins : [];
  if (!list.length) return { ok: false, reason: "empty_allowlist", login: who };
  const norm = (s) => String(s).trim().toLowerCase();
  const hit = list.map(norm).includes(norm(who));
  return { ok: hit, reason: hit ? "ok" : "not_allowed", login: who };
}

/** 拒绝措辞单一出口：Issue 回执（Task 6）与后台 403 页（计划 4）都取这里，改文案只改这里 */
export function denyNote(verdict) {
  const { reason, login } = verdict || {};
  if (reason === "no_login") return "未取到 GitHub 登录名：凭证可能已失效，请重新完成 Device Flow 登录。";
  if (reason === "empty_allowlist") return "config/site-config.json 的 adminLogins 为空：后台按 fail-closed 处理，任何人都不进。请先填入管理员 login 并提交。";
  if (reason === "not_allowed") return `\`${login}\` 不在 config/site-config.json 的 adminLogins 名单里：确认权限请由名单内账号提交该 login 后重试。`;
  return "";
}

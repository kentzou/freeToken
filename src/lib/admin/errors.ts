/** GitHub 错误的唯一分类处。同是 403，「限流」与「权限不足」的处置动作完全不同（前者等一会再试，
 *  后者要去看 token scope），所以分类只能有一处，不能让每个按钮各自 regex 一遍 message。
 *  依据：crawler/github.mjs 的 httpError() 把 status/note 挂在 Error 上身；fetch 自身失败（断网/CORS）没有 status。 */

export type AdminErrorKind = "network" | "auth" | "ratelimit" | "forbidden" | "conflict" | "server" | "unknown";

export interface AdminError {
  kind: AdminErrorKind;
  status: number;
  message: string;
  hint: string;
}

export function classifyError(e: unknown): AdminError {
  const err = e as { message?: unknown; status?: unknown; note?: unknown } | null;
  const status = Number(err?.status ?? 0) || 0;
  const message = String(err?.note || err?.message || (typeof e === "string" ? e : "")) || "未知错误";
  const mk = (kind: AdminErrorKind, hint: string): AdminError => ({ kind, status, message, hint });
  if (!status) return mk("network", "网络不可达或被浏览器拦截（跨域 404 不带 CORS 头时也是这个形态）：后台需要浏览器能直连 api.github.com。");
  if (status === 401) return mk("auth", "凭证已失效：请重新完成 Device Flow 登录。");
  if (status === 403) {
    if (/rate\s*limit/i.test(message)) return mk("ratelimit", "触发 GitHub 限流（未认证请求按 IP 计 60 次/小时）：稍后重试，并确认请求确实带上了 token。");
    return mk("forbidden", "权限不足：该 token 缺少所需 scope（读写仓库文件需 Contents:write、触发爬取需 Actions:write、回执与关单需 Issues:write）。");
  }
  if (status === 404) return mk("unknown", "仓库里没有这个路径：确认 config/site-config.json 的 githubRepo 是否填对、该文件是否已提交。");
  if (status === 409 || status === 422) return mk("conflict", "远端文件已被别人改动（sha 过期）：重新读取后再保存，别硬覆盖。");
  if (status >= 500) return mk("server", "GitHub 侧故障：稍后重试，本次未写入任何数据。");
  return mk("unknown", "GitHub 返回了未预期状态码：把上面原文贴进审核 Issue 复盘。");
}

/** 「该不该清会话」只由这里回答：401 才清。403/限流清会话会把「读不了」伪装成「登出」，让人反复重登。 */
export function isAuthError(e: unknown) {
  return classifyError(e).kind === "auth";
}

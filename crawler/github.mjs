/** GitHub 单一调用层（实施设计 §3 裁决 + §5 假设 #5）：所有 API 读写只从 gh() 出。
 *  传输层注入即测试接缝——单测断言 payload（url/method/body/headers/labels），
 *  真环境换回默认 globalThis.fetch 即上线，业务代码零改动。 */

import { decodeBase64Utf8, encodeBase64Utf8 } from "./serialize.mjs";

export const API = "https://api.github.com";
export const UPSTREAM_REPO = "hope0719/token-fbi";

/** Device Flow 的两个端点在 github.com 域，不在 api.github.com（且只认 urlencoded/Accept json） */
export const LOGIN_BASE = "https://github.com/login";

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET 失败重试 3 次指数退避（spec §7.7）；POST/PATCH 失败重试无意义（幂等/权限问题），报即得报。
 *  两种请求体：body → JSON（默认），form → application/x-www-form-urlencoded（Device Flow 只认它）；
 *  accept 默认仍是 vnd.github+json，device flow 传 "application/json" 换 JSON 应答。 */
export async function gh(url, opts = {}) {
  const {
    method = "GET",
    body,
    form,
    token,
    fetchImpl = globalThis.fetch,
    backoff = [1000, 4000, 10000],
    sleep = sleepDefault,
    accept = "application/vnd.github+json",
  } = opts;
  const headers = { "user-agent": "token-intel-bureau-pipeline", accept };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const attempts = method === "GET" ? backoff.length + 1 : 1;
  let last = "网络错误";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(backoff[i - 1]);
    try {
      const res = await fetchImpl(url, { method, headers, body: payload });
      if (method !== "GET" || res.status < 500) return res; // GET 的 4xx 也交调用方判（404=上游不存在该文件）
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.message;
    }
  }
  throw new Error(`GitHub 请求失败（重试 ${attempts - 1} 次）：${method} ${url} → ${last}`);
}

/** 失败应答里的 message 摘要（GitHub 的 4xx 回 JSON；非 JSON 时回空串，绝不二次抛错） */
async function errorNote(res) {
  try {
    const j = await res.json();
    return String((j && j.message) || "").slice(0, 200);
  } catch {
    return "";
  }
}

/** 应答体容错解析：device flow 端点在 Accept 不被满足时回落 urlencoded，
 *  两种形态都要能读出 error/access_token——所以只读 text()，不假设 json() 可用。 */
async function readKv(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j && typeof j === "object" ? j : {};
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

/** HTTP 错误统一把 status/note 挂到 Error 上身：上层（src/lib/admin/errors.ts）据此分
 *  「过期 / 限流 / 权限不足 / sha 冲突」四类因——403 至少有两种成因，只报状态码会误导运维。 */
async function httpError(label, res) {
  const note = await errorNote(res);
  const e = new Error(`${label}：HTTP ${res.status}${note ? ` ${note}` : ""}`);
  e.status = res.status;
  e.note = note;
  return e;
}

export async function latestCommitSha(repo = UPSTREAM_REPO, opts = {}) {
  const res = await gh(`${API}/repos/${repo}/commits?per_page=1`, opts);
  if (!res.ok) throw new Error(`读取上游最新 commit 失败：HTTP ${res.status}（${repo}）`);
  const list = await res.json();
  const sha = Array.isArray(list) && list[0] && list[0].sha;
  if (typeof sha !== "string") throw new Error(`上游 commit 列表形态异常：${repo}`);
  return sha;
}

export async function fetchRawText(url, opts = {}) {
  const res = await gh(url, opts);
  if (!res.ok) throw new Error(`拉取 raw 源文件失败：HTTP ${res.status} ${url}`);
  return res.text();
}

export async function createIssue(repo, { title, body, labels }, opts = {}) {
  const res = await gh(`${API}/repos/${repo}/issues`, { ...opts, method: "POST", body: { title, body, labels } });
  if (!res.ok) throw new Error(`开 Issue 失败：HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { number: j.number, url: j.html_url };
}

export async function commentIssue(repo, number, body, opts = {}) {
  const res = await gh(`${API}/repos/${repo}/issues/${number}/comments`, { ...opts, method: "POST", body: { body } });
  if (!res.ok) throw new Error(`回复 Issue 评论失败：HTTP ${res.status}（#${number}）`);
}

export async function closeIssue(repo, number, opts = {}) {
  const res = await gh(`${API}/repos/${repo}/issues/${number}`, { ...opts, method: "PATCH", body: { state: "closed" } });
  if (!res.ok) throw new Error(`关闭 Issue 失败：HTTP ${res.status}（#${number}）`);
}

export async function dispatchWorkflow(repo, workflowFile, ref = "main", opts = {}) {
  const res = await gh(`${API}/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    ...opts,
    method: "POST",
    body: { ref },
  });
  if (!res.ok) throw await httpError(`触发 workflow_dispatch 失败（${workflowFile}）`, res);
}

/** Device Flow ①：申请一次性用户码。缺字段即抛——GitHub 改了应答形态必须人工核查，
 *  不能让 undefined interval 把轮询节奏算成 0 秒打爆端点。 */
export async function requestDeviceCode({ clientId, scope = "repo", fetchImpl = globalThis.fetch } = {}) {
  const res = await gh(`${LOGIN_BASE}/device/code`, {
    method: "POST",
    form: { client_id: clientId, scope },
    accept: "application/json",
    fetchImpl,
  });
  const j = await readKv(res);
  if (!res.ok) throw await httpError(`申请设备码失败（${String(j.error ?? "")}）`, res);
  for (const k of ["device_code", "user_code", "verification_uri", "expires_in", "interval"]) {
    if (j[k] === undefined) throw new Error(`设备码应答缺字段 ${k}：GitHub device flow 形态变更，需人工核查`);
  }
  return {
    deviceCode: String(j.device_code),
    userCode: String(j.user_code),
    verificationUri: String(j.verification_uri),
    expiresIn: Number(j.expires_in),
    interval: Number(j.interval),
  };
}

/** Device Flow ②：轮询换 token。只回「应答事实」，不判断业务分支——
 *  退避/累计次数/超时归 src/lib/admin/auth.ts，本层零策略（与 gh() 同口径）。 */
export async function pollDeviceToken({ clientId, deviceCode, fetchImpl = globalThis.fetch } = {}) {
  const res = await gh(`${LOGIN_BASE}/oauth/access_token`, {
    method: "POST",
    form: { client_id: clientId, device_code: deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" },
    accept: "application/json",
    fetchImpl,
  });
  const j = await readKv(res);
  if (j.access_token)
    return {
      kind: "token",
      token: String(j.access_token),
      tokenType: String(j.token_type || "bearer"),
      scope: String(j.scope || ""),
      expiresIn: Number(j.expires_in) || 0,
    };
  if (j.error) return { kind: String(j.error), message: String(j.error_description || "") };
  if (!res.ok) throw await httpError("轮询设备令牌失败", res);
  return { kind: "unknown", message: "应答既无 access_token 也无 error" };
}

/** 身份：401 是「凭证失效」这个事实（返回 kind 让上层清会话），403 限流/权限才是异常。 */
export async function fetchUserLogin({ token = "", fetchImpl = globalThis.fetch } = {}) {
  const res = await gh(`${API}/user`, { token, fetchImpl });
  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) throw await httpError("读取登录身份失败", res);
  const j = await res.json();
  if (typeof j.login !== "string" || !j.login) throw new Error("/user 应答缺 login 字段");
  return { kind: "user", login: j.login, avatarUrl: typeof j.avatar_url === "string" ? j.avatar_url : "" };
}

/** Contents 读：三态返回。走 api.github.com 而非 raw.githubusercontent.com——
 *  后者带 token 会被 GitHub 拒（404 "Not Found"），前者是唯一能带凭据的读通道，
 *  且 404 一定带 JSON 体，可稳定区分「文件不存在（档案已清）」与「读不了」。
 *  sleep 是透给 gh() 的退避接缝（单测不真等 1s/4s/10s），缺省仍是真计时器。 */
export async function readRepoFile(repo, path, { token = "", fetchImpl = globalThis.fetch, sleep = sleepDefault } = {}) {
  const res = await gh(`${API}/repos/${repo}/contents/${path}`, { token, fetchImpl, sleep });
  if (res.status === 404) return { kind: "missing" };
  if (!res.ok) return { kind: "error", status: res.status, message: await errorNote(res) };
  const j = await res.json();
  if (j.encoding !== "base64" || typeof j.content !== "string")
    return { kind: "error", status: 200, message: `Contents 应答形态异常（encoding=${String(j.encoding)}），拒读半截内容` };
  return {
    kind: "file",
    text: decodeBase64Utf8(j.content),
    sha: String(j.sha),
    updatedAt: String(j.updated_at || ""),
    size: Number(j.size) || 0,
  };
}

/** Contents 写：GitHub 的 PUT 是「一文件一提交」，多文件原子提交不在本计划范围（见 §3 决策 3 的部分失败口径）。 */
export async function writeRepoFile(repo, path, { message, text, sha = "", branch = "main", token = "", fetchImpl = globalThis.fetch } = {}) {
  const body = { message, content: encodeBase64Utf8(text), branch };
  if (sha) body.sha = sha; // 更新必带最新 sha；新建带 sha 会 422
  const res = await gh(`${API}/repos/${repo}/contents/${path}`, { method: "PUT", body, token, fetchImpl });
  if (!res.ok) throw await httpError(`写入 ${path} 失败`, res);
  const j = await res.json();
  const commitSha = j && j.commit && j.commit.sha;
  const contentSha = j && j.content && j.content.sha;
  if (typeof commitSha !== "string" || typeof contentSha !== "string") throw new Error(`写入 ${path} 应答缺 commit/content sha`);
  return { commitSha, contentSha };
}

/** 发布历史：workflow 文件名的 `.` 不需转义（计划 2 的 dispatchWorkflow 已在用同名路径）。
 *  perPage 固定在前，query 串可被测试逐字断言。 */
export async function listWorkflowRuns(repo, workflowFile, { token = "", perPage = 5, fetchImpl = globalThis.fetch } = {}) {
  const res = await gh(`${API}/repos/${repo}/actions/workflows/${workflowFile}/runs?per_page=${perPage}`, { token, fetchImpl });
  if (!res.ok) throw await httpError("读取 workflow runs 失败", res);
  const j = await res.json();
  if (!Array.isArray(j.workflow_runs)) throw new Error("runs 应答形态异常：缺 workflow_runs 数组");
  return j.workflow_runs.map(toRunRow);
}

/** 完成态才算耗时：进行中的 updated_at 每刷新一次就变一次，算出来是「已跑多久」不是耗时，
 *  原型表格里那种行本就显示「—」。缺 run_started_at 时退回 created_at。 */
function toRunRow(r) {
  const start = Date.parse(r.run_started_at || r.created_at);
  const end = r.status === "completed" ? Date.parse(r.updated_at) : NaN;
  return {
    id: r.id,
    runNumber: r.run_number,
    event: r.event,
    status: r.status,
    conclusion: r.conclusion ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    htmlUrl: r.html_url,
    durationMs: Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null,
  };
}

/** 当前开放的审核 Issue（labels=review）：/admin 的回执/关单要找它。没有就返回 null，
 *  不是错误——后台盖章不该因为 Issue 被手工关掉而失败（runReview 的 issueNumber 为 0 时跳过回执）。 */
export async function openReviewIssue(repo, { token = "", fetchImpl = globalThis.fetch } = {}) {
  const res = await gh(`${API}/repos/${repo}/issues?state=open&labels=review&per_page=1`, { token, fetchImpl });
  if (!res.ok) throw await httpError("读取审核 Issue 失败", res);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error("Issue 列表应答形态异常：不是数组");
  const first = list[0];
  return first ? { number: first.number, url: first.html_url } : null;
}

/** 清洗后链接 HEAD 探测：非 200 仅用于 warn 标记，任何异常折成 0，永不阻塞主管线（spec §7.7） */
export async function headStatus(url, opts = {}) {
  try {
    const res = await gh(url, { ...opts, method: "HEAD" });
    return res.status;
  } catch {
    return 0;
  }
}

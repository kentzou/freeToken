/** GitHub 单一调用层（实施设计 §3 裁决 + §5 假设 #5）：所有 API 读写只从 gh() 出。
 *  传输层注入即测试接缝——单测断言 payload（url/method/body/headers/labels），
 *  真环境换回默认 globalThis.fetch 即上线，业务代码零改动。 */

export const API = "https://api.github.com";
export const UPSTREAM_REPO = "hope0719/token-fbi";

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET 失败重试 3 次指数退避（spec §7.7）；POST/PATCH 失败重试无意义（幂等/权限问题），报即得报 */
export async function gh(url, opts = {}) {
  const {
    method = "GET",
    body,
    token,
    fetchImpl = globalThis.fetch,
    backoff = [1000, 4000, 10000],
    sleep = sleepDefault,
  } = opts;
  const headers = { "user-agent": "token-intel-bureau-pipeline", accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const attempts = method === "GET" ? backoff.length + 1 : 1;
  let last = "网络错误";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(backoff[i - 1]);
    try {
      const res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (method !== "GET" || res.status < 500) return res; // GET 的 4xx 也交调用方判（404=上游不存在该文件）
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.message;
    }
  }
  throw new Error(`GitHub 请求失败（重试 ${attempts - 1} 次）：${method} ${url} → ${last}`);
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
  if (!res.ok) throw new Error(`触发 workflow_dispatch 失败：HTTP ${res.status}（${workflowFile}）`);
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

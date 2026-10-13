/** 统一 HTTP 客户端：UA、限速、重试、超时。
 *  全站唯一出网口——adapter 不得各自 fetch，否则限速与重试口径会分叉。
 *  零依赖：仅用 Node 内置 fetch（Node 18+）。 */

/** 本站 UA 标识：爬虫应可被站点识别与联系，不做伪装。 */
const UA =
  "Mozilla/5.0 (compatible; TokenIntelNavBot/1.0; +https://github.com/) AppleWebKit/537.36";

/** 默认限速：同一域两次请求最小间隔（毫秒）。合规要求，禁止调低于 1000。 */
const MIN_INTERVAL_MS = 1500;

const lastHit = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 取 URL 的 host 作限速键（同域共享节流）。 */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

/** 域级限速：距上次请求不足间隔则等待。 */
async function throttle(url) {
  const host = hostOf(url);
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/** 带超时的 fetch。 */
async function fetchWithTimeout(url, { timeout = 20000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9", ...headers },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 抓取文本，失败重试 3 次（指数退避）。返回 { ok, status, text, error }。 */
export async function grabText(url, { retries = 3, timeout = 20000 } = {}) {
  let lastErr = "";
  for (let i = 0; i <= retries; i++) {
    await throttle(url);
    try {
      const res = await fetchWithTimeout(url, { timeout });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        // 4xx 不重试（除 429）：客户端错误重试无意义
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, status: res.status, text: "", error: lastErr };
        }
      } else {
        const text = await res.text();
        return { ok: true, status: res.status, text, error: "" };
      }
    } catch (e) {
      lastErr = e?.name === "AbortError" ? `timeout ${timeout}ms` : String(e?.message || e);
    }
    if (i < retries) await sleep(800 * 2 ** i);
  }
  return { ok: false, status: 0, text: "", error: lastErr };
}

/** 只探可达性，不读正文（probe 用）。 */
export async function probeUrl(url, { timeout = 12000 } = {}) {
  await throttle(url);
  try {
    const res = await fetchWithTimeout(url, { timeout });
    return { ok: res.ok, status: res.status, error: res.ok ? "" : `HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e?.name === "AbortError" ? `timeout ${timeout}ms` : String(e?.message || e),
    };
  }
}

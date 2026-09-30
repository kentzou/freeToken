/** /admin 会话的唯一存取处：只管「有没有、过没过期」，不知道白名单存在（白名单在 crawler/allowlist.mjs）。
 *  storage 由调用方注入（浏览器传 sessionStorage）——顶层访问 window 在静态导出下会直接 hydration 崩。 */

export const SESSION_KEY = "tfn.admin.session";

export interface AdminSession {
  token: string;
  login: string;
  avatarUrl: string;
  scope: string;
  /** epoch ms；0 = 长期有效（GitHub 不给不带 expires_in 的令牌到期时间，宁可当长期也不要误判过期） */
  expiresAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 内存替身：本任务与计划 4 的组件测共用，免得每个测试文件再手搓一份 Map */
export function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    dump: () => Object.fromEntries(m),
  };
}

export function saveSession(storage: StorageLike, s: AdminSession) {
  storage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(storage: StorageLike) {
  storage.removeItem(SESSION_KEY);
}

/** 读不抛：脏 JSON、缺 token、形状不对一律 null（＝未登录）。
 *  「登录页」比「白屏」和「假装已登录」都可修，所以这里把每种畸形统一退化成未登录。 */
export function readSession(storage: StorageLike): AdminSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (typeof o.token !== "string" || !o.token) return null;
  return {
    token: o.token,
    login: typeof o.login === "string" ? o.login : "",
    avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl : "",
    scope: typeof o.scope === "string" ? o.scope : "",
    expiresAt: Number(o.expiresAt) || 0,
  };
}

/** skew 抵消浏览器与 GitHub 的时钟差：默认 30s，免得「还剩 2 秒」被判有效、下一个请求吃 401。 */
export function sessionVerdict(s: AdminSession | null, now: number, skew = 30_000): "none" | "valid" | "expired" {
  if (!s) return "none";
  if (s.expiresAt === 0) return "valid";
  return s.expiresAt - skew > now ? "valid" : "expired";
}

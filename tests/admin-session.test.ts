import { describe, expect, it } from "vitest";
import {
  SESSION_KEY,
  clearSession,
  memoryStorage,
  readSession,
  saveSession,
  sessionVerdict,
  type AdminSession,
} from "@/lib/admin/session";

const S = (over: Partial<AdminSession> = {}): AdminSession => ({
  token: "ghu_live",
  login: "hope0719",
  avatarUrl: "https://avatars.githubusercontent.com/u/777",
  scope: "repo",
  expiresAt: 0,
  ...over,
});

describe("/admin 会话存取（storage 注入，模块顶层不碰 window）", () => {
  it("键名固定 + 存取自往返", () => {
    expect(SESSION_KEY).toBe("tfn.admin.session");
    const st = memoryStorage();
    saveSession(st, S());
    expect(Object.keys(st.dump())).toEqual([SESSION_KEY]);
    expect(readSession(st)).toEqual(S());
  });

  it("脏 JSON / 缺 token / 非对象一律当未登录（返回 null，绝不抛）", () => {
    const cases: string[] = ["{oops", '{"login":"a"}', "null", '"文本"', "[]"];
    for (const raw of cases) expect(readSession(memoryStorage({ [SESSION_KEY]: raw }))).toBeNull();
    expect(readSession(memoryStorage())).toBeNull();
  });

  it("expiresAt === 0 表示长期令牌：任何时刻都有效", () => {
    expect(sessionVerdict(S({ expiresAt: 0 }), 9e15)).toBe("valid");
  });

  it("过期判定留 30s 安全余量，抵消浏览器与 GitHub 的时钟差", () => {
    const s = S({ expiresAt: 1_000_000 });
    expect(sessionVerdict(s, 969_999)).toBe("valid"); // 1_000_000-30_000 > 969_999
    expect(sessionVerdict(s, 970_000)).toBe("expired"); // 到线即过期，不赌最后一次请求
    expect(sessionVerdict(s, 970_000, 0)).toBe("valid"); // 去掉余量后同一时刻仍有效：证明 skew 确实在起作用
    expect(sessionVerdict(s, 970_000, 60_000)).toBe("expired");
  });

  it("clearSession 抹掉键；null 会话判为 none", () => {
    const st = memoryStorage();
    saveSession(st, S());
    clearSession(st);
    expect(readSession(st)).toBeNull();
    expect(sessionVerdict(null, 0)).toBe("none");
  });
});

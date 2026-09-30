import { describe, expect, it } from "vitest";
import { denyNote } from "../crawler/allowlist.mjs";
import { CHECKING_STATE, resolveView, startLogin, waitLogin } from "@/lib/admin/auth";
import { memoryStorage, readSession, saveSession } from "@/lib/admin/session";
import { hdr, mkFetch, res } from "./helpers/fake-fetch";

const CFG = { oauthClientId: "Iv1.abc", adminLogins: ["hope0719"] };
const LIVE = { token: "ghu_live", login: "", avatarUrl: "", scope: "", expiresAt: 0 };
const ok = (login: string, avatar = "https://avatars.githubusercontent.com/u/777") => res(200, { login, avatar_url: avatar });
const noSleep = async () => {};

describe("认证状态机：视图判定与 Device Flow 轮询（零真请求，断言 payload）", () => {
  it("占位值不可用：缺 client_id 或未登录时根本不发请求", async () => {
    const a = mkFetch(ok("hope0719"));
    const sa = await resolveView({
      config: { oauthClientId: "  ", adminLogins: ["hope0719"] },
      storage: memoryStorage(),
      fetchImpl: a.fn,
      now: () => 0,
    });
    expect(sa.view).toBe("unconfigured");
    expect(sa.hint).toContain("oauthClientId");
    expect(a.calls.length).toBe(0);

    const b = mkFetch(ok("hope0719"));
    const sb = await resolveView({ config: CFG, storage: memoryStorage(), fetchImpl: b.fn, now: () => 0 });
    expect(sb.view).toBe("login");
    expect(b.calls.length).toBe(0);

    expect(CHECKING_STATE.view).toBe("checking"); // UI 起骨架时的占位，防首屏闪登录页
  });

  it("会话本地已过期＝expired + 清会话，且不再拿过期 token 去撞 401", async () => {
    const storage = memoryStorage();
    saveSession(storage, { ...LIVE, login: "hope0719", expiresAt: 1000 });
    const f = mkFetch(ok("hope0719"));
    const st = await resolveView({ config: CFG, storage, fetchImpl: f.fn, now: () => 5000 });
    expect(st.view).toBe("expired");
    expect(st.login).toBe("hope0719"); // 过期态也要显示「刚才是谁」，否则用户不知道该用哪个账号重登
    expect(st.hint).toContain("Device Flow");
    expect(readSession(storage)).toBeNull();
    expect(f.calls.length).toBe(0);
  });

  it("/user 回 401＝凭证已被撤销 → expired + 清会话", async () => {
    const storage = memoryStorage();
    saveSession(storage, { ...LIVE, token: "ghu_revoked", login: "hope0719" });
    const f = mkFetch(res(401, { message: "Bad credentials" }));
    const st = await resolveView({ config: CFG, storage, fetchImpl: f.fn, now: () => 0 });
    expect(st.view).toBe("expired");
    expect(readSession(storage)).toBeNull();
    expect(f.calls[0].url).toBe("https://api.github.com/user");
    expect(hdr(f.calls[0], "authorization")).toBe("Bearer ghu_revoked");
  });

  it("名单命中＝ready，并把 /user 的真实身份回写会话（顶栏身份块不必再打第二次请求）", async () => {
    const storage = memoryStorage();
    saveSession(storage, LIVE);
    const f = mkFetch(ok("hope0719"));
    const st = await resolveView({ config: CFG, storage, fetchImpl: f.fn, now: () => 0 });
    expect(st).toEqual({
      view: "ready",
      login: "hope0719",
      avatarUrl: "https://avatars.githubusercontent.com/u/777",
      scope: "",
      hint: "",
    });
    expect(readSession(storage)?.login).toBe("hope0719");
    expect(readSession(storage)?.avatarUrl).toBe("https://avatars.githubusercontent.com/u/777");
  });

  it("名单未命中＝denied，措辞逐字取 denyNote；被拒时不回写身份", async () => {
    const storage = memoryStorage();
    saveSession(storage, LIVE);
    const f = mkFetch(ok("hope0719"));
    const st = await resolveView({
      config: { oauthClientId: "Iv1.abc", adminLogins: ["someone-else"] },
      storage,
      fetchImpl: f.fn,
      now: () => 0,
    });
    expect(st.view).toBe("denied");
    expect(st.hint).toBe(denyNote({ ok: false, reason: "not_allowed", login: "hope0719" }));
    expect(readSession(storage)?.login).toBe("");
  });

  it("adminLogins 为空＝谁都不进（fail-closed，正是当前仓库态）", async () => {
    const storage = memoryStorage();
    saveSession(storage, LIVE);
    const st = await resolveView({
      config: { oauthClientId: "Iv1.abc", adminLogins: [] },
      storage,
      fetchImpl: mkFetch(ok("hope0719")).fn,
      now: () => 0,
    });
    expect(st.view).toBe("denied");
    expect(st.hint).toContain("config/site-config.json");
  });

  it("403 不是「没登录」：原样抛出带 status/note，会话绝不被清（限流与权限不足的处置动作完全不同）", async () => {
    const storage = memoryStorage();
    saveSession(storage, LIVE);
    const e = await resolveView({ config: CFG, storage, fetchImpl: mkFetch(res(403, { message: "API rate limit exceeded for 45.149.92.7." })).fn, now: () => 0 }).catch((x) => x);
    expect(e.status).toBe(403);
    expect(e.note).toContain("rate limit");
    expect(readSession(storage)?.token).toBe("ghu_live");
  });

  it("startLogin：缺配置零请求并抛指引；正常时 client_id 去空白后逐字进 form body", async () => {
    const bad = mkFetch(res(200, {}));
    await expect(startLogin({ config: { oauthClientId: "" }, fetchImpl: bad.fn })).rejects.toThrow("oauthClientId");
    expect(bad.calls.length).toBe(0);

    const f = mkFetch(res(200, { device_code: "dc-1", user_code: "WDJB-MJHT", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 }));
    const d = await startLogin({ config: { oauthClientId: "  Iv1.abc " }, fetchImpl: f.fn });
    expect(d).toEqual({ deviceCode: "dc-1", userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", expiresIn: 900, interval: 5 });
    expect(f.calls[0].url).toBe("https://github.com/login/device/code");
    expect(f.calls[0].init.body).toBe("client_id=Iv1.abc&scope=repo");
    expect(hdr(f.calls[0], "accept")).toBe("application/json");
  });

  it("waitLogin：pending→slow_down→rate_limit→token 全链，节奏按 GitHub 口径，token 落会话", async () => {
    const storage = memoryStorage();
    const slept: number[] = [];
    const f = mkFetch(
      res(200, { error: "authorization_pending" }),
      res(200, { error: "slow_down" }),
      res(200, { error: "rate_limit" }),
      res(200, { access_token: "ghu_new", token_type: "bearer", scope: "repo", expires_in: 28800 }),
    );
    const out = await waitLogin({
      clientId: "Iv1.abc",
      deviceCode: "dc-1",
      interval: 5,
      expiresIn: 900,
      storage,
      fetchImpl: f.fn,
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(out).toEqual({ kind: "token", token: "ghu_new", scope: "repo", polls: 4 });
    expect(slept).toEqual([5000, 10000, 15000]); // slow_down 与 rate_limit 各把 interval 抬 5 秒
    expect(readSession(storage)).toEqual({ token: "ghu_new", login: "", avatarUrl: "", scope: "repo", expiresAt: 28800000 });
  });

  it("waitLogin：终止类应答立刻收手且不写会话（拒绝 / 过期 / 超期 / 凭证错）", async () => {
    const storage = memoryStorage();
    const base = { clientId: "Iv1.abc", deviceCode: "dc-1", interval: 5, storage, sleep: noSleep, now: () => 0 };
    expect(await waitLogin({ ...base, expiresIn: 900, fetchImpl: mkFetch(res(200, { error: "access_denied" })).fn })).toEqual({ kind: "access_denied", polls: 1 });
    expect(await waitLogin({ ...base, expiresIn: 900, fetchImpl: mkFetch(res(200, { error: "expired_token" })).fn })).toEqual({ kind: "expired", polls: 1 });
    expect(
      await waitLogin({ ...base, expiresIn: 900, fetchImpl: mkFetch(res(200, { error: "incorrect_client_credentials", error_description: "check app" })).fn }),
    ).toEqual({ kind: "fatal", error: "incorrect_client_credentials", message: "check app", polls: 1 });
    const f = mkFetch(res(200, { error: "authorization_pending" }));
    // 假时钟必须逐次推进：deadline = now() + expiresIn*1000 是「相对起点」的时刻，
    // 常量时钟下 now() 永远追不上 deadline ⇒ timeout 分支不可达、循环永不退出（实测表现为用例超时）。
    // 每 tick 前进 61000ms > 60s 的总闸跨度 ⇒ 循环首检即到点 ⇒ polls 仍为 0。
    let tick = 0;
    const advancing = () => (tick += 61000);
    expect(await waitLogin({ ...base, expiresIn: 60, fetchImpl: f.fn, now: advancing })).toEqual({ kind: "timeout", polls: 0 });
    expect(f.calls.length).toBe(0); // 到点即止，连一次都不该发
    expect(readSession(storage)).toBeNull(); // 四种终止形态都没留下会话
  });

  it("waitLogin：传输层瞬时抛错不停表，容忍后仍等到 token", async () => {
    const storage = memoryStorage();
    const slept: number[] = [];
    const f = mkFetch(
      new Error("fetch failed"),
      res(200, { error: "authorization_pending" }),
      res(200, { access_token: "ghu_new", token_type: "bearer", scope: "repo", expires_in: 28800 }),
    );
    const out = await waitLogin({
      clientId: "Iv1.abc",
      deviceCode: "dc-1",
      interval: 5,
      expiresIn: 900,
      storage,
      fetchImpl: f.fn,
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(out).toEqual({ kind: "token", token: "ghu_new", scope: "repo", polls: 2 });
    expect(slept).toEqual([5000, 5000]); // 抛错轮不算一次轮询，也不放大节奏
    expect(readSession(storage)).toEqual({ token: "ghu_new", login: "", avatarUrl: "", scope: "repo", expiresAt: 28800000 });
  });

  it("waitLogin：连续三次传输抛错即收手报 transport，绝不死循环也不留会话", async () => {
    const storage = memoryStorage();
    const slept: number[] = [];
    const f = mkFetch(new Error("fetch failed"), new Error("fetch failed"), new Error("fetch failed"));
    const out = await waitLogin({
      clientId: "Iv1.abc",
      deviceCode: "dc-1",
      interval: 5,
      expiresIn: 900,
      storage,
      fetchImpl: f.fn,
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    // 断言只钉「原始原因没有被吞掉」，不绑 gh() 的整条模板串——
    // crawler/github.mjs:51 会把 fetch reject 重铸为「GitHub 请求失败（重试 0 次）：POST … → fetch failed」，
    // 绑全文案等于把调用层的一条错误格式字符串钉进认证层用例，改文案会误伤。
    expect(out).toEqual({ kind: "fatal", error: "transport", message: expect.stringContaining("fetch failed"), polls: 0 });
    expect(f.calls.length).toBe(3); // 只发了三次就收手，不是无限重试
    expect(slept).toEqual([5000, 5000]); // 第三次直接返回，不再多睡一轮
    expect(readSession(storage)).toBeNull();
  });
});

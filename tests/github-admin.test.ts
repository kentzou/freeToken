import { describe, expect, it } from "vitest";
import {
  API,
  LOGIN_BASE,
  fetchUserLogin,
  gh,
  listWorkflowRuns,
  openReviewIssue,
  pollDeviceToken,
  readRepoFile,
  requestDeviceCode,
  writeRepoFile,
} from "../crawler/github.mjs";
import { encodeBase64Utf8 } from "../crawler/serialize.mjs";
import { fail, hdr, jsonOf, mkFetch, noSleep, res, resText } from "./helpers/fake-fetch";

void noSleep; // 本文件不需要 sleep（device flow 的 POST 一律不重试），保留 import 校验位

describe("Device Flow（无 secret 的静态站登录面）", () => {
  it("申请设备码：form 编码 body + accept: application/json（绝不是 JSON body）", async () => {
    const { fn, calls } = mkFetch(
      res(200, {
        device_code: "dc",
        user_code: "WDJB-MJHT",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      })
    );
    const r = await requestDeviceCode({ clientId: "Iv1.abc", fetchImpl: fn });
    expect(calls[0].url).toBe(`${LOGIN_BASE}/device/code`);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe("client_id=Iv1.abc&scope=repo");
    expect(hdr(calls[0], "content-type")).toBe("application/x-www-form-urlencoded");
    expect(hdr(calls[0], "accept")).toBe("application/json");
    expect(r).toEqual({
      deviceCode: "dc",
      userCode: "WDJB-MJHT",
      verificationUri: "https://github.com/login/device",
      expiresIn: 900,
      interval: 5,
    });
  });

  it("申请设备码：应答缺 interval → 抛「缺字段」，别让 undefined 一路带到轮询节奏里", async () => {
    const { fn } = mkFetch(
      res(200, { device_code: "dc", user_code: "U", verification_uri: "https://github.com/login/device", expires_in: 900 })
    );
    await expect(requestDeviceCode({ clientId: "c", fetchImpl: fn })).rejects.toThrowError(/缺字段 interval/);
  });

  it("申请设备码：403 incorrect_client_credentials 抛错带 error 键（配置错要一眼看见）", async () => {
    const { fn } = mkFetch(resText(403, "error=incorrect_client_credentials&error_description=Wrong+client"));
    const e = fail(await requestDeviceCode({ clientId: "bad", fetchImpl: fn }).catch((x) => x));
    expect(e.status).toBe(403);
    expect(e.message).toContain("incorrect_client_credentials");
  });

  it("轮询成功：grant_type 常量进 form body，token/scope/expires_in 归一为 camelCase", async () => {
    const { fn, calls } = mkFetch(res(200, { access_token: "ghu_x", token_type: "bearer", scope: "repo", expires_in: 86400 }));
    const r = await pollDeviceToken({ clientId: "Iv1.abc", deviceCode: "dc", fetchImpl: fn });
    expect(calls[0].init.body).toBe(
      "client_id=Iv1.abc&device_code=dc&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
    );
    expect(r).toEqual({ kind: "token", token: "ghu_x", tokenType: "bearer", scope: "repo", expiresIn: 86400 });
  });

  it("轮询错误用 HTTP 200 + error 字段表达：三种终态都要透成 kind，且 POST 不重试", async () => {
    for (const [err, desc] of [
      ["slow_down", "Too many requests"],
      ["access_denied", "The user denied this request"],
      ["expired_token", "The device code expired"],
    ]) {
      const { fn, calls } = mkFetch(res(200, { error: err, error_description: desc }));
      expect(await pollDeviceToken({ clientId: "c", deviceCode: "dc", fetchImpl: fn })).toEqual({ kind: err, message: desc });
      expect(calls).toHaveLength(1);
    }
  });

  it("应答是 x-www-form-urlencoded（Accept 未被满足时的回落形态）也读得懂", async () => {
    const { fn } = mkFetch(resText(200, "error=authorization_pending&error_description=Pending"));
    expect(await pollDeviceToken({ clientId: "c", deviceCode: "dc", fetchImpl: fn })).toEqual({
      kind: "authorization_pending",
      message: "Pending",
    });
  });
});

describe("身份 / Contents / runs", () => {
  it("fetchUserLogin：200 取 login+avatar_url；401 → kind unauthorized（凭证失效是事实不是异常）", async () => {
    const a = mkFetch(res(200, { login: "hope0719", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" }));
    expect(await fetchUserLogin({ token: "t", fetchImpl: a.fn })).toEqual({
      kind: "user",
      login: "hope0719",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    });
    expect(hdr(a.calls[0], "authorization")).toBe("Bearer t");
    const b = mkFetch(res(401, { message: "Bad credentials" }));
    expect(await fetchUserLogin({ token: "t", fetchImpl: b.fn })).toEqual({ kind: "unauthorized" });
  });

  it("fetchUserLogin：403 限流绝不能被当成「未登录」（status/note 挂 Error 上身供上层分因）", async () => {
    const { fn } = mkFetch(res(403, { message: "API rate limit exceeded for 45.149.92.7." }));
    const e = fail(await fetchUserLogin({ token: "t", fetchImpl: fn }).catch((x) => x));
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(403);
    expect(e.note).toContain("rate limit");
  });

  it("readRepoFile：200 → base64 中文解码 + sha/updated_at（Contents 是唯一读通道，raw 域 404 无 CORS 头）", async () => {
    const text = '[{"name":"阶跃星辰 StepFun"}]\n';
    const { fn, calls } = mkFetch(
      res(200, {
        name: "tokens.json",
        path: "data/tokens.json",
        sha: "abc123",
        size: 40,
        encoding: "base64",
        content: encodeBase64Utf8(text),
        updated_at: "2026-09-29T14:44:41Z",
      })
    );
    expect(await readRepoFile("o/r", "data/tokens.json", { token: "t", fetchImpl: fn })).toEqual({
      kind: "file",
      text,
      sha: "abc123",
      updatedAt: "2026-09-29T14:44:41Z",
      size: 40,
    });
    expect(calls[0].url).toBe(`${API}/repos/o/r/contents/data/tokens.json`);
  });

  it("readRepoFile：404 → kind missing（「档案已清」与「读不到」必须分家），且只发一次请求", async () => {
    const { fn, calls } = mkFetch(res(404, { message: "Not Found" }));
    expect(await readRepoFile("o/r", "pending/changes.json", { fetchImpl: fn })).toEqual({ kind: "missing" });
    expect(calls).toHaveLength(1);
  });

  it("readRepoFile：403 一类非 404 失败 → kind error 带 status+message（交视图层出黄条）", async () => {
    const { fn } = mkFetch(res(403, { message: "Resource not accessible by personal access token" }));
    expect(await readRepoFile("o/r", "config/site-config.json", { token: "t", fetchImpl: fn })).toMatchObject({
      kind: "error",
      status: 403,
    });
  });

  it("readRepoFile：encoding 不是 base64（目录或应答漂移）→ error，绝不返回半截文本", async () => {
    const { fn } = mkFetch(res(200, { type: "dir", encoding: null }));
    expect(await readRepoFile("o/r", "data", { fetchImpl: fn })).toMatchObject({ kind: "error", status: 200 });
  });

  it("writeRepoFile：PUT body = message/content/branch，更新态才带 sha；应答取双 sha", async () => {
    const { fn, calls } = mkFetch(
      res(200, { content: { sha: "csha" }, commit: { sha: "parsa" } }),
      res(201, { content: { sha: "c2" }, commit: { sha: "p2" } })
    );
    const opts = { token: "t", fetchImpl: fn };
    expect(
      await writeRepoFile("o/r", "data/tokens.json", { message: "m", text: "[]\n", sha: "old", branch: "main", ...opts })
    ).toEqual({ commitSha: "parsa", contentSha: "csha" });
    expect(calls[0].init.method).toBe("PUT");
    expect(jsonOf(calls[0])).toEqual({ message: "m", content: "W10K", branch: "main", sha: "old" });
    await writeRepoFile("o/r", "pending/changes.json", { message: "m2", text: "{}", branch: "main", ...opts });
    expect("sha" in jsonOf(calls[1])).toBe(false); // 新建文件带 sha 会 422
  });

  it("writeRepoFile：409（sha 落后）抛错带 status，让上层说「远端已变，请重读」而不是「保存失败」", async () => {
    const { fn } = mkFetch(res(409, { message: "sha changed" }));
    const e = fail(
      await writeRepoFile("o/r", "data/rules.json", { message: "m", text: "{}", sha: "stale", token: "t", fetchImpl: fn }).catch(
        (x) => x
      )
    );
    expect(e.status).toBe(409);
    expect(e.message).toContain("409");
  });

  it("listWorkflowRuns：per_page 进 query + 完成态算 durationMs、进行中为 null（耗时列显示「—」的依据）", async () => {
    const { fn, calls } = mkFetch(
      res(200, {
        total_count: 2,
        workflow_runs: [
          {
            id: 412,
            run_number: 412,
            event: "issue_comment",
            status: "completed",
            conclusion: "success",
            created_at: "2026-09-29T10:00:00Z",
            updated_at: "2026-09-29T10:02:41Z",
            run_started_at: "2026-09-29T10:00:00Z",
            html_url: "https://github.com/o/r/actions/runs/412",
          },
          {
            id: 413,
            run_number: 413,
            event: "schedule",
            status: "in_progress",
            conclusion: null,
            created_at: "2026-09-29T12:00:00Z",
            updated_at: "2026-09-29T12:00:30Z",
            html_url: "https://github.com/o/r/actions/runs/413",
          },
        ],
      })
    );
    expect(await listWorkflowRuns("o/r", "crawl.yml", { token: "t", perPage: 5, fetchImpl: fn })).toEqual([
      {
        id: 412,
        runNumber: 412,
        event: "issue_comment",
        status: "completed",
        conclusion: "success",
        createdAt: "2026-09-29T10:00:00Z",
        updatedAt: "2026-09-29T10:02:41Z",
        htmlUrl: "https://github.com/o/r/actions/runs/412",
        durationMs: 161000,
      },
      {
        id: 413,
        runNumber: 413,
        event: "schedule",
        status: "in_progress",
        conclusion: null,
        createdAt: "2026-09-29T12:00:00Z",
        updatedAt: "2026-09-29T12:00:30Z",
        htmlUrl: "https://github.com/o/r/actions/runs/413",
        durationMs: null,
      },
    ]);
    expect(calls[0].url).toBe(`${API}/repos/o/r/actions/workflows/crawl.yml/runs?per_page=5`);
  });

  it("listWorkflowRuns：缺 workflow_runs 数组 → 抛「形态异常」（不把 undefined 交给表格渲染）", async () => {
    const { fn } = mkFetch(res(200, {}));
    await expect(listWorkflowRuns("o/r", "crawl.yml", { fetchImpl: fn })).rejects.toThrowError(/workflow_runs/);
  });

  it("openReviewIssue：固定 query 取第一条；空列表 → null（无 Issue 时后台仍可盖章）", async () => {
    const a = mkFetch(res(200, [{ number: 42, html_url: "https://github.com/o/r/issues/42" }]));
    expect(await openReviewIssue("o/r", { token: "t", fetchImpl: a.fn })).toEqual({
      number: 42,
      url: "https://github.com/o/r/issues/42",
    });
    expect(a.calls[0].url).toBe(`${API}/repos/o/r/issues?state=open&labels=review&per_page=1`);
    const b = mkFetch(res(200, []));
    expect(await openReviewIssue("o/r", { fetchImpl: b.fn })).toBeNull();
  });
});

describe("gh() 扩 form/accept 不改既有口径", () => {
  it("默认 accept 仍是 vnd.github+json；无 form 时 JSON body 原样；GET 重试语义不变", async () => {
    const { fn, calls } = mkFetch(res(200, {}));
    await gh(`${API}/x`, { method: "POST", body: { a: 1 }, fetchImpl: fn });
    expect(hdr(calls[0], "accept")).toBe("application/vnd.github+json");
    expect(calls[0].init.body).toBe('{"a":1}');
    expect(hdr(calls[0], "content-type")).toBe("application/json");
    expect(calls).toHaveLength(1);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeBase64Utf8, encodeBase64Utf8 } from "../crawler/serialize.mjs";
import { classifyError, isAuthError } from "@/lib/admin/errors";
import { commitText, loadCurrentData, readSameOrigin, readTextFile } from "@/lib/admin/remote";
import { hdr, jsonOf, mkFetch, res } from "./helpers/fake-fetch";

const tokensText = readFileSync("data/tokens.json", "utf8");
const donotsText = readFileSync("data/donots.json", "utf8");
const rulesText = readFileSync("data/rules.json", "utf8");

/** Contents 读的真应答替身：base64 里放的就是仓库真文件的字节（LF 文本由 dump 产出，见 Step 6 说明） */
const fileRes = (sha: string, text: string) =>
  res(200, { name: sha, sha, encoding: "base64", content: encodeBase64Utf8(text), updated_at: "2026-09-29T14:44:41Z", size: text.length });

describe("运行时读面：Contents 是唯一带凭据的读通道，错误必须分因", () => {
  it("readTextFile：URL 逐字、token 进 Authorization、base64 解回原文一字不差", async () => {
    const f = mkFetch(fileRes("SHA-T", tokensText));
    const r = await readTextFile("hope0719/token-fbi-next", "data/tokens.json", { token: "ghu_x", fetchImpl: f.fn });
    expect(r).toEqual({ text: tokensText, sha: "SHA-T" });
    expect(f.calls[0].url).toBe("https://api.github.com/repos/hope0719/token-fbi-next/contents/data/tokens.json");
    expect(hdr(f.calls[0], "authorization")).toBe("Bearer ghu_x");
    expect(decodeBase64Utf8(encodeBase64Utf8(tokensText))).toBe(tokensText);
  });

  it("错误分因：404 不是 403，两种 403 也不是同一种病；401 才许清会话", async () => {
    await expect(readTextFile("o/r", "pending/changes.json", { fetchImpl: mkFetch(res(404, { message: "Not Found" })).fn })).rejects.toThrow("仓库文件不存在：pending/changes.json");
    const f403 = mkFetch(res(403, { message: "API rate limit exceeded for 45.149.92.7." }));
    const e = await readTextFile("o/r", "data/tokens.json", { fetchImpl: f403.fn }).catch((x) => x);
    expect(e.status).toBe(403);
    expect(e.note).toContain("rate limit");
    expect(classifyError(e).kind).toBe("ratelimit");
    expect(classifyError(e).hint).toContain("限流");
    // 纯分类器的其余分支（同是 403，权限不足的说法完全不同）
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(classifyError({ status: 401, message: "Bad credentials" }).kind).toBe("auth");
    expect(isAuthError({ status: 401 })).toBe(true);
    expect(isAuthError({ status: 403, note: "Resource not accessible by personal access token" })).toBe(false);
    expect(classifyError({ status: 403, note: "Resource not accessible by personal access token" }).hint).toContain("scope");
    expect(classifyError({ status: 409 }).kind).toBe("conflict");
    expect(classifyError({ status: 500 }).kind).toBe("server");
    expect(classifyError({ status: 404 }).hint).toContain("githubRepo");
  });

  it("commitText：远端逐字相同就一个字也不写（防纯格式重排污染 git 历史）", async () => {
    const f = mkFetch(res(200, {}));
    const cur = { text: '{\n  "a": 1\n}\n', sha: "S1" };
    expect(await commitText({ repo: "o/r", path: "p.json", text: cur.text, message: "chore: m", current: cur, fetchImpl: f.fn })).toEqual({ kind: "unchanged", sha: "S1" });
    expect(f.calls.length).toBe(0);
  });

  it("commitText：有实质差异才 PUT，sha 用刚读到的值（缺 sha 会吃 409/422）", async () => {
    const f = mkFetch(fileRes("S1", "旧文本\n"), res(200, { commit: { sha: "C9" }, content: { sha: "S2" } }));
    const out = await commitText({ repo: "o/r", path: "data/meta.json", text: "新文本\n", message: "chore: 更新", fetchImpl: f.fn });
    expect(out).toEqual({ kind: "committed", commitSha: "C9", contentSha: "S2" });
    expect(f.calls.length).toBe(2);
    expect(f.calls[1].init.method).toBe("PUT");
    expect(jsonOf(f.calls[1])).toEqual({ message: "chore: 更新", content: encodeBase64Utf8("新文本\n"), branch: "main", sha: "S1" });
  });

  it("loadCurrentData：三表齐才返回，条数是仓库真值（33 / 22 / 五表）；缺任一条即抛，绝不给半截", async () => {
    const f = mkFetch(fileRes("S-T", tokensText), fileRes("S-D", donotsText), fileRes("S-R", rulesText));
    const cur = await loadCurrentData("o/r", { token: "ghu_x", fetchImpl: f.fn });
    expect(cur.cards.length).toBe(33);
    expect(cur.donots.length).toBe(22);
    expect(Object.keys(cur.rules)).toEqual(["featured", "logo", "cardCopy", "detailSlug", "regionByName"]);
    expect(f.calls.map((c) => c.url.split("/contents/")[1])).toEqual(["data/tokens.json", "data/donots.json", "data/rules.json"]);
    expect(cur.shas["data/rules.json"]).toBe("S-R");
    const bad = mkFetch(fileRes("S-T", tokensText), res(404, { message: "Not Found" }), fileRes("S-R", rulesText));
    await expect(loadCurrentData("o/r", { fetchImpl: bad.fn })).rejects.toThrow("仓库文件不存在：data/donots.json");
  });

  it("readSameOrigin：200/404/网络故障三态分流（把故障读成「档案已清」是最坏的一种成功）", async () => {
    const ok = await readSameOrigin("/data/tokens.json", { fetchImpl: mkFetch(res(200, {})).fn });
    expect(ok.kind).toBe("ok");
    const gone = await readSameOrigin("/pending/changes.json", { fetchImpl: mkFetch(res(404, { message: "Not Found" })).fn });
    expect(gone).toEqual({ kind: "missing" });
    const down = await readSameOrigin("/data/tokens.json", { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
    expect(down.kind).toBe("error");
    expect((down as { kind: "error"; hint: string }).hint).toContain("api.github.com");
  });
});

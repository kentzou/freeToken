/** /admin「批准并发布」的通路验证：全部走假 transport，断言的是**请求序列**——
 *  谁先谁后、发了几次、payload 解码回来是什么。真写线上不在本机跑（§0 红线）。 */
import { describe, expect, it } from "vitest";
import { diffAll } from "../crawler/diff.mjs";
import { decodeBase64Utf8, dump, encodeBase64Utf8 } from "../crawler/serialize.mjs";
import { publishApprovals } from "@/lib/admin/publish";
import { hdr, jsonOf, mkFetch, res } from "./helpers/fake-fetch";
import { realData, realPending } from "./helpers/pending";

const cur = realData();
const pend = realPending();
/** 远端替身一律用 dump(真值)：Task 1 实测三张产出表 dump 稳定，所以「没改的文件必然走 unchanged」
 *  这条断言才与线上一致；喂磁盘原文会因 CRLF 把每个文件都判成有差异。 */
const fileRes = (sha: string, value: unknown) => res(200, { sha, encoding: "base64", content: encodeBase64Utf8(dump(value)), updated_at: "" });
const putOk = (sha: string) => res(200, { commit: { sha: `c-${sha}` }, content: { sha } });
const baseDeps = { repo: "hope0719/token-fbi-next", token: "ghu_x", login: "hope0719", adminLogins: ["hope0719"], pending: pend, pendingCurrent: null, issueNumber: 42 };
const methods = (calls: { init: Record<string, any> }[]) => calls.map((c) => String(c.init.method)).join(",");

describe("publishApprovals：白名单 → 指令 → runReview → 逐文件 Contents 提交", () => {
  it("越权：一个请求也不发（后台的第二把锁，独立于 UI 门禁）", async () => {
    const f = mkFetch(res(200, {}));
    const out = await publishApprovals({ ...baseDeps, login: "stranger", decisions: [{ action: "approve", id: "card:WorkBuddy" }], fetchImpl: f.fn });
    expect(out.kind).toBe("denied");
    expect((out as { hint: string }).hint).toContain("不在 config/site-config.json 的 adminLogins");
    expect(f.calls).toEqual([]);
  });

  it("空名单＝全拒（fail-closed）：现网 config/site-config.json 就是 []，Day-1 不填后台一律不可写", async () => {
    const f = mkFetch(res(200, {}));
    const out = await publishApprovals({ ...baseDeps, adminLogins: [], decisions: [{ action: "approve", id: "all" }], fetchImpl: f.fn });
    expect(out.kind).toBe("denied");
    expect((out as { hint: string }).hint).toContain("adminLogins 为空");
    expect(f.calls).toEqual([]);
  });

  it("一条没选：noop 且零请求（连读面都不发，省一次限流额度）", async () => {
    const f = mkFetch(res(200, {}));
    const out = await publishApprovals({ ...baseDeps, decisions: [], fetchImpl: f.fn });
    expect(out.kind).toBe("noop");
    expect((out as { hint: string }).hint).toContain("一条也没选中");
    expect(f.calls).toEqual([]);
  });

  it("单条 approve：只写真的变了的两个文件，donots/rules 走 unchanged，pending 剩 3 条不关单", async () => {
    const f = mkFetch(
      fileRes("S-T", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules),
      res(201, {}), putOk("S-T2"), fileRes("S-P", pend), putOk("S-P2"),
    );
    const out = (await publishApprovals({ ...baseDeps, decisions: [{ action: "approve", id: "card:WorkBuddy" }], fetchImpl: f.fn })) as any;
    expect(methods(f.calls)).toBe("GET,GET,GET,POST,PUT,GET,PUT");
    expect(out.kind).toBe("published");
    expect(out.committed).toEqual(["data/tokens.json", "pending/changes.json"]);
    expect(out.unchanged).toEqual(["data/donots.json", "data/rules.json"]);
    expect(out.failed).toEqual([]);
    expect(out.pendingLeft).toBe(3);
    expect(hdr(f.calls[3], "authorization")).toBe("Bearer ghu_x");
    expect(jsonOf(f.calls[3]).body).toContain("✅ 通过 `card:WorkBuddy`");
    expect(decodeBase64Utf8(jsonOf(f.calls[4]).content)).toContain("（核验续期）");
  });

  it("approve all：四文件全 PUT + 回执 + 关单；写回的卡表是 32 张（真数据实算，非手搓）", async () => {
    const f = mkFetch(
      fileRes("S-T", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules),
      res(201, {}), res(200, {}), putOk("A"), putOk("B"), putOk("C"), fileRes("S-P", pend), putOk("D"),
    );
    const out = (await publishApprovals({ ...baseDeps, decisions: [{ action: "approve", id: "all" }], fetchImpl: f.fn })) as any;
    expect(methods(f.calls)).toBe("GET,GET,GET,POST,PATCH,PUT,PUT,PUT,GET,PUT");
    expect(out).toMatchObject({ kind: "published", unchanged: [], failed: [], pendingLeft: 0 });
    expect(out.committed).toEqual(["data/tokens.json", "data/donots.json", "data/rules.json", "pending/changes.json"]);
    expect(f.calls[4].url).toBe("https://api.github.com/repos/hope0719/token-fbi-next/issues/42");
    const puts = f.calls.filter((c) => c.init.method === "PUT");
    const written = JSON.parse(decodeBase64Utf8(jsonOf(puts[0]).content));
    expect(written).toHaveLength(32);
    expect(written.find((c: any) => c.name === "书生·端砚 墨点计划（上海AI实验室）")).toBeUndefined();
    expect(JSON.parse(decodeBase64Utf8(jsonOf(puts[3]).content))).toMatchObject({ version: 1, changes: [] });
  });

  it("卡片校验不过：整体抛、PUT 零次（宁可不合不半合在后台路径上同样成立）", async () => {
    const risky = diffAll(cur, { ...cur, cards: cur.cards.map((c: any) => (c.name === "WorkBuddy" ? { ...c, link: "https://s.mi.cn/bad" } : c)) }).changed;
    const f = mkFetch(fileRes("S-T", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules));
    await expect(
      publishApprovals({
        ...baseDeps,
        pending: { version: 1, upstreamSha: null, detectedAt: "d", changes: risky },
        decisions: [{ action: "approve", id: "card:WorkBuddy" }],
        fetchImpl: f.fn,
      }),
    ).rejects.toThrowError(/推广短链域名|拒绝写盘/);
    expect(methods(f.calls)).toBe("GET,GET,GET"); // 读面已经走完才炸；写面一次也没有
  });

  it("id 未命中（队列已被别人清过）：published 但 committed 为空，missing 原样交给 UI", async () => {
    const f = mkFetch(fileRes("S-T", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules), res(201, {}));
    const out = (await publishApprovals({ ...baseDeps, decisions: [{ action: "approve", id: "card:早就不在了" }], fetchImpl: f.fn })) as any;
    expect(out.kind).toBe("published");
    expect(out.missing).toEqual(["card:早就不在了"]);
    expect(out.committed).toEqual([]);
    expect(methods(f.calls)).toBe("GET,GET,GET,POST"); // 回执照发（审计），数据一个字不写
  });

  it("第二个文件 sha 过期（409）：不中断后面的文件，failed 逐条带分类 hint", async () => {
    const f = mkFetch(
      fileRes("S-T", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules),
      res(201, {}), res(200, {}), putOk("A"), res(409, { message: "sha has changed" }), putOk("C"),
      fileRes("S-P", pend), putOk("D"),
    );
    const out = (await publishApprovals({ ...baseDeps, decisions: [{ action: "approve", id: "all" }], fetchImpl: f.fn })) as any;
    expect(out.committed).toEqual(["data/tokens.json", "data/rules.json", "pending/changes.json"]);
    expect(out.failed).toEqual([{ path: "data/donots.json", hint: "远端文件已被别人改动（sha 过期）：重新读取后再保存，别硬覆盖。（HTTP 409）" }]);
    expect(out.kind).toBe("published"); // 不再有第六个 kind：failed.length>0 就是「部分失败」，UI 分支少一条
    expect(out.pendingLeft).toBe(0);
  });

  it("pendingCurrent  supplied 时：队列那次 PUT 的 sha 来自它，且全程不再多读一次队列文件", async () => {
    const snap = { text: dump(pend), sha: "S-PEND" };
    const f = mkFetch(
      fileRes("S-C", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules),
      res(201, {}), putOk("c1"), putOk("cP"),
    );
    const out = (await publishApprovals({ repo: "o/r", token: "ghu_x", login: "hope0719", adminLogins: ["hope0719"], pending: pend, issueNumber: 42, decisions: [{ action: "approve", id: "card:WorkBuddy" }], pendingCurrent: snap, fetchImpl: f.fn })) as any;
    /** 序位钉：`mkFetch` 按调用次序取应答且末尾钳制（fake-fetch.ts:26），所以替身个数必须等于真实请求数——
     *  多塞一个不会报错，只会让「第 4 次是回执 POST」这条前提悄悄挪位（执行期 C14）。
     *  本例的真实序列：读三表 → 回执 → 写 cards → 写 pending（队列不再被二次 GET）。 */
    expect(methods(f.calls)).toBe("GET,GET,GET,POST,PUT,PUT");
    expect(out.committed).toEqual(["data/tokens.json", "pending/changes.json"]);
    expect(out.unchanged).toEqual(["data/donots.json", "data/rules.json"]);
    const put = f.calls.find((c) => c.url.endsWith("/contents/pending/changes.json") && c.init.method === "PUT");
    expect(jsonOf(put!).sha).toBe("S-PEND"); // 来自读队列的那一次 GET，不是 loadCurrentData 的任何一个 sha
    expect(["S-C", "S-D", "S-R"]).not.toContain(jsonOf(put!).sha);
    expect(f.calls.filter((c) => c.url.endsWith("/contents/pending/changes.json") && c.init.method !== "PUT").length).toBe(0);
  });

  it("队列 PUT 带的是快照 sha：并发下别人先改过队列就是 409，而不是被事后重读悄悄覆盖", async () => {
    const snap = { text: dump(pend), sha: "S-PEND" };
    const f = mkFetch(
      fileRes("S-C", cur.cards), fileRes("S-D", cur.donots), fileRes("S-R", cur.rules),
      res(201, {}), putOk("c1"), res(409, { message: "sha has changed" }),
    );
    const out = (await publishApprovals({ repo: "o/r", token: "t", login: "hope0719", adminLogins: ["hope0719"], pending: pend, issueNumber: 42, decisions: [{ action: "approve", id: "card:WorkBuddy" }], pendingCurrent: snap, fetchImpl: f.fn })) as any;
    expect(methods(f.calls)).toBe("GET,GET,GET,POST,PUT,PUT");
    expect(out.committed).toEqual(["data/tokens.json"]);
    expect(out.unchanged).toEqual(["data/donots.json", "data/rules.json"]);
    expect(out.failed).toEqual([{ path: "pending/changes.json", hint: "远端文件已被别人改动（sha 过期）：重新读取后再保存，别硬覆盖。（HTTP 409）" }]);
    expect(jsonOf(f.calls[5]).sha).toBe("S-PEND"); // 撞 409 用的正是那一次读的 sha：本任务要防的就是「写前再读一遍」把冲突读没
  });
});

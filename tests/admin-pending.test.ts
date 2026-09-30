import { describe, expect, it } from "vitest";
import { diffAll } from "../crawler/diff.mjs";
import { dump, encodeBase64Utf8 } from "../crawler/serialize.mjs";
import { loadPending, parsePending, pendingIds, toRows } from "@/lib/admin/pending";
import { mkFetch, noSleep, res } from "./helpers/fake-fetch";
import { DROPPED, WATCHED, realData, realPending } from "./helpers/pending";

const pend = realPending();
const pendRes = () => res(200, { sha: "S-P", encoding: "base64", content: encodeBase64Utf8(dump(pend)), updated_at: "" });

describe("待审队列的运行时读：404 / 读不了 / 形态错 三态绝不混同", () => {
  it("404＝档案已清（正常空队列），不是错误", async () => {
    const f = mkFetch(res(404, { message: "Not Found" }));
    expect(await loadPending({ repo: "o/r", fetchImpl: f.fn })).toEqual({ kind: "empty" });
    expect(f.calls[0].url).toBe("https://api.github.com/repos/o/r/contents/pending/changes.json");
  });

  it("形态正常＝loaded：四种形态齐、id 逐字对得上、base64→dump→parse 往返不丢字段", async () => {
    const out = await loadPending({ repo: "o/r", token: "ghu_x", fetchImpl: mkFetch(pendRes()).fn });
    expect(out.kind).toBe("loaded");
    const rows = (out as any).pending;
    expect(rows.changes.length).toBe(4);
    expect(pendingIds(rows)).toEqual(["card:WorkBuddy", `watch:${WATCHED}`, "rules:featured", `card:${DROPPED}`]);
    expect(pendingIds(null)).toEqual([]);
    expect(rows.detectedAt).toBe(pend.detectedAt);
    expect(parsePending(dump(pend))).toEqual(pend);
  });

  it("403＝读不了：status 与可诊断 hint 都要带出来，且绝不退化成「空」", async () => {
    const out = await loadPending({ repo: "o/r", fetchImpl: mkFetch(res(403, { message: "API rate limit exceeded for 45.149.92.7." })).fn });
    expect(out).toMatchObject({ kind: "error", status: 403 });
    expect((out as any).hint).toContain("限流");
    expect((out as any).message).toContain("rate limit"); // 原文必须带出来，否则黄条只能说「读取失败」
    expect((out as any).changes).toBeUndefined(); // 故障态不得携带任何队列内容
  });

  it("形态错＝按停机处理：解析失败不能当空队列（那样待审变更会被静默丢掉）", async () => {
    const broken = res(200, { sha: "S", encoding: "base64", content: encodeBase64Utf8('{"version":1,"changes":{}}'), updated_at: "" });
    const out = await loadPending({ repo: "o/r", fetchImpl: mkFetch(broken).fn });
    expect(out.kind).toBe("error");
    expect((out as any).message).toContain("形态异常");
    expect((out as any).hint).toContain("停机");
    expect(() => parsePending("不是 JSON")).toThrow("不是合法 JSON");
    expect(() => parsePending('{"changes":[{"kind":"card"}]}')).toThrow("条目缺 kind/name");
  });

  it("传输层抛错＝error 态，绝不上抛 rejected Promise（UI 按三态分流，未捕获 rejection 会让整页崩）", async () => {
    const f = mkFetch(new Error("fetch failed"));
    const out = await loadPending({ repo: "o/r", fetchImpl: f.fn, sleep: noSleep() });
    expect(out.kind).toBe("error");
    expect((out as any).status).toBe(0); // 无 HTTP 状态＝classifyError 的 network 分支
    expect((out as any).message).toContain("fetch failed"); // 原始原因不许被吞，否则黄条只能说「读取失败」
    expect((out as any).hint).toContain("api.github.com");
    expect((out as any).pending).toBeUndefined(); // 故障态不得携带队列内容
    expect(f.calls.length).toBe(4); // GET 三次退避＝共 4 次请求（sleep 已注入，不真等）
  });

  it("toRows：四种真实形态的行事实、删除判定、规则表整表口径与字段截断", () => {
    const rows = toRows(pend);
    expect(rows.map((r) => r.id)).toEqual(["card:WorkBuddy", `watch:${WATCHED}`, "rules:featured", `card:${DROPPED}`]);
    expect(rows.map((r) => r.kindLabel)).toEqual(["情报卡", "观望项", "规则表", "情报卡"]);
    expect(rows.map((r) => r.removal)).toEqual([false, false, false, true]);
    expect(rows.map((r) => r.whole)).toEqual([false, false, true, false]);
    const { cards, donots, rules } = realData();
    const wb = cards.find((c: any) => c.name === "WorkBuddy");
    expect(rows[0].fields).toEqual([{ field: "quota", from: wb.quota, to: `${wb.quota}（核验续期）` }]);
    const dn0 = donots.find((w: any) => w.name === WATCHED);
    expect(rows[1].fields).toEqual([{ field: "why", from: dn0.why, to: `${dn0.why}（复核补充）` }]);
    expect(rows[3].fields[0]).toEqual({ field: "(整条)", from: "存在", to: "" }); // null 在行里落成空串，UI 不再各自判 null
    expect(toRows(null)).toEqual([]);

    // 截断上限只有一份（FIELD_LIMIT 在 crawler/diff.mjs）：「WorkBuddy 多 25 个键」交给真 diffAll，行数据不是手搓的
    const extra = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`x${i}`, i]));
    const d = diffAll(
      { cards, donots, rules },
      { cards: cards.map((c: any) => (c.name === "WorkBuddy" ? { ...c, ...extra } : c)), donots, rules },
    );
    const [row] = toRows({ version: 1, upstreamSha: "s", detectedAt: "d", changes: d.changed } as any);
    expect(d.changed.length).toBe(1);
    expect(d.changed[0].fields.length).toBe(25);
    expect(row.fields.length).toBe(20);
    expect(row.extraFields).toBe(5);
  });
});

/** Tab1 的两条命门：① 四类读态不许混同——把「读不到」渲成「一切正常」是最坏的一种成功；
 *  ② 部分失败不许说「已发布」（计划 3 §7-18）。
 *  盖章通路走真 publishApprovals 的返回形态 + 假 transport，断言的是页面上出现的字与请求序列。
 *  renderToStaticMarkup 不跑事件循环，所以交互语义必须落在纯函数/reducer 里（简报的分流函数就是为此），
 *  组件只把结果渲成属性。容器 ReviewPane 在本文件不测——它的每句话都由这两件代答（阶段 F 用裸 CDP 补真实点击）。 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { diffAll } from "../crawler/diff.mjs";
import { dump, encodeBase64Utf8 } from "../crawler/serialize.mjs";
import { loadReviewContext, toRows, type ChangeRow, type PendingJson, type ReviewContext } from "@/lib/admin/pending";
import { ReviewList, type ReviewListProps } from "@/app/admin/ReviewPane";
import {
  EMPTY_REVIEW,
  REVIEW_LOADING_TEXT,
  approveNote,
  publishReceipt,
  reviewView,
  staleNote,
} from "@/lib/admin/uiModel";
import { mkFetch, noSleep, res } from "./helpers/fake-fetch";
import { realData, realPending } from "./helpers/pending";

const pend = realPending();
const rows = toRows(pend);
const CTX = (over: Partial<ReviewContext>): ReviewContext => ({
  pending: { kind: "empty" },
  issueNumber: 0,
  issueUrl: "",
  issueNote: "",
  authFailed: false,
  ...over,
});
const loadedCtx = CTX({ pending: { kind: "loaded", pending: pend }, issueNumber: 42, issueUrl: "https://github.com/o/r/issues/42" });
const badCtx = CTX({ pending: { kind: "error", status: 403, message: "Forbidden", hint: "权限不足" } });

const list = (over: Partial<ReviewListProps> = {}) =>
  renderToStaticMarkup(
    <ReviewList
      view={reviewView(loadedCtx, rows)}
      busy={false}
      receipt={null}
      stamped={{}}
      onDecide={() => {}}
      onApproveAll={() => {}}
      onReload={() => {}}
      {...over}
    />,
  );

describe("reviewView：四支分流只此一处", () => {
  it("ctx 未回＝loading、404＝empty——一个是过程一个是结论，不许共用一支", () => {
    expect(reviewView(null, [])).toEqual({ kind: "loading", text: REVIEW_LOADING_TEXT });
    expect(reviewView(CTX({}), [])).toEqual({ kind: "empty" });
  });
  it("读失败＝error：message 与 hint 原样搬运，绝不退化成空队列", () => {
    expect(reviewView(badCtx, [])).toEqual({
      kind: "error",
      bar: { className: "adm-statebar bad", role: "alert", text: "✗ 待审列表读取失败：Forbidden", hint: "权限不足" },
    });
  });
  it("有队列＝list：来源行只用数据面真给的东西，Issue 号决定批注措辞", () => {
    const v = reviewView(loadedCtx, rows);
    if (v.kind !== "list") throw new Error(`期望 list，实际 ${v.kind}`);
    expect(v.rows).toBe(rows);
    expect(v.source).toContain(`检测于 ${pend.detectedAt} · 审核 Issue #42`);
    expect(v.source).toContain(`上游指纹 ${pend.upstreamSha}`); // 实测 data/meta.json 的 sourceFingerprint＝0276a024c4f6e10e（非 null），缺指纹的分支由 sourceLine 自己的用例覆盖
    expect(v.note).toBe(approveNote(42));
    expect(v.note).toContain("/approve");
    const n = reviewView(CTX({ pending: { kind: "loaded", pending: pend } }), rows);
    if (n.kind !== "list") throw new Error("期望 list");
    expect(n.source).not.toContain("Issue"); // 无 Issue 时写「Issue #0」是谎报一个不存在的编号
    expect(n.note).toContain("没有回执可留");
  });
});

describe("ReviewList：四类读态各渲什么", () => {
  it("loading：只有 role=status 与骨架，不出卡片，更不出「没有待审的变更」", () => {
    const html = list({ view: reviewView(null, []) });
    expect(html).toContain('class="adm-skeleton"');
    expect(html).toContain('role="status"');
    expect(html).toContain(REVIEW_LOADING_TEXT);
    expect(html).not.toContain(EMPTY_REVIEW.heading);
    expect(html).not.toContain("<button");
  });
  it("empty：大邮戳「档案已清」+ 计数 0（复用现成 .stamp，不新造第三套），零按钮", () => {
    const html = list({ view: reviewView(CTX({}), []) });
    expect(html).toContain('class="adm-stampbox"');
    expect(html).toContain('class="stamp"');
    expect(html).toContain(EMPTY_REVIEW.stamp);
    expect(html).toContain(EMPTY_REVIEW.heading);
    expect(html).toContain(">0<");
    expect(html).not.toContain("<button");
  });
  it("error：红条正文与 hint 都在页面上且有重试出口，同时绝不出现空态那句话", () => {
    const html = list({ view: reviewView(badCtx, []) });
    expect(html).toContain('role="alert"');
    expect(html).toContain("✗ 待审列表读取失败：Forbidden");
    expect(html).toContain("权限不足");
    expect(html).toContain("重新读取");
    expect(html).not.toContain(EMPTY_REVIEW.heading);
  });
  it("真实四形态：删除行说「确认删除并发布」，其余说「批准并发布」，规则表走整表口径，全站不出现「新增」", () => {
    const html = list();
    expect(html.split('class="adm-card"').length - 1).toBe(4);
    expect(html.match(/批准并发布/g)?.length).toBe(3); // 三条非删除行；「批准全部」按钮的措辞故意不含这四字（见 approveAllLabel）
    expect(html).toContain("确认删除并发布");
    expect(html).toContain("修改 · 情报卡");
    expect(html).toContain("修改 · 观望项");
    expect(html).toContain("修改 · 规则表");
    expect(html).toContain("删除 · 情报卡");
    expect(html).toContain("整表对比");
    expect(rows[0].beforeText).toBe(""); // 逐字段行不携全文：整表全文只给 whole 行
    const { rules } = realData();
    expect(rows[2].beforeText).toBe(dump(rules.featured)); // 全文＝dump(现值)，序列化仍只有一处出口
    expect(rows[2].afterText).toBe(dump(rules.featured.slice(0, -1))); // fixture 的 after 是「删掉末条」的同一张表
    const whole = list({ view: { kind: "list", rows: [rows[2]], source: "来源：测试注入", note: approveNote(null) } });
    expect(whole.match(/<pre/g)?.length).toBe(2); // before 与 after 各一块，缺任何一半都是「只给你看一半」
    // 「全站不出现新增」的依据是实测而非设计：只读探针 .superpowers/probe-pending-strings.mjs 数过，
    // 真实 pending 的 DOM 文本面（kind/name + fields 的 field|from|to）里「新增」命中 0 次；
    // 队列本身也只有 changed+removed（run.mjs 的 syncOnce 把 added 直接自动发布）。
    expect(html).not.toContain("新增");
  });
  it("字段超上限：说「另有 N 处」而不是静默丢弃", () => {
    /** 行数据仍由真 diffAll 产出（与 tests/admin-pending.test.ts:72-82 同一手法）：
     *  一张真实卡最多十来个字面字段，凑不满 20 的上限，所以给它挂 22 个只在两边取值不同的键——
     *  形状是比对器产的，不是手搓的；比对器改了字段名，这里先红。 */
    const { cards, donots, rules } = realData();
    const variant = (shift: number) => Object.fromEntries(Array.from({ length: 22 }, (_, i) => [`f${i}`, i + shift]));
    const d = diffAll(
      { cards: [...cards, { name: "很多字段卡", ...variant(0) }], donots, rules },
      { cards: [...cards, { name: "很多字段卡", ...variant(1) }], donots, rules },
    );
    expect(d.changed.length).toBe(1); // 只脏这一张：其余卡两边同值，不会混进来
    const many: PendingJson = { ...pend, changes: d.changed };
    const big = toRows(many);
    const one: ChangeRow = big[0];
    expect(one.fields.length).toBe(20); // FIELD_LIMIT，实现在 crawler/diff.mjs
    expect(one.extraFields).toBe(2);
    const html = list({ view: { kind: "list", rows: [one], source: "来源：测试注入", note: approveNote(null) } });
    expect(html.split("<tr>").length - 1).toBe(20);
    expect(html).toContain("另有 2 处字段差异");
  });
});

describe("盖章：邮戳、禁用与三态回执", () => {
  it("盖过章的行换成一枚小邮戳，按钮整组收起（防重复盖章）", () => {
    const html = list({ stamped: { [rows[0].id]: "approve" } });
    const first = html.split('class="adm-card"')[1] ?? "";
    const second = html.split('class="adm-card"')[2] ?? "";
    expect(first).toContain("已归档");
    expect(first).not.toContain("<button");
    expect(second).toContain("<button"); // 只收起了盖过章那一行，其余照旧可操作
  });
  it("退稿走另一枚邮戳：已退稿（两枚措辞都在 uiModel，组件里不写第三种）", () => {
    const html = list({ stamped: { [rows[0].id]: "reject" } });
    expect((html.split('class="adm-card"')[1] ?? "").includes("已退稿")).toBe(true);
  });
  it("busy：整块 aria-busy，且所有按钮一律 disabled——一次盖章没回来之前不许有第二次", () => {
    const html = list({ busy: true });
    expect(html).toContain('aria-busy="true"');
    const buttons = html.match(/<button/g)?.length ?? 0;
    expect(buttons).toBeGreaterThan(0);
    expect(html.match(/disabled=""/g)?.length).toBe(buttons);
  });
  it("部分失败＝「部分失败」，且页面上不许出现「已发布」", () => {
    const html = list({
      receipt: publishReceipt({
        kind: "published",
        applied: [{ action: "approve", id: rows[0].id }],
        missing: [],
        pendingLeft: 2,
        committed: ["data/tokens.json"],
        unchanged: [],
        failed: [{ path: "data/rules.json", hint: "远端文件已被别人改动（sha 过期）" }],
      }),
    });
    expect(html).toContain("部分失败");
    expect(html).toContain("data/rules.json");
    expect(html).toContain("重试是幂等");
    expect(html).not.toContain("已发布");
  });
  it("未命中（missing 非空）：条目 id 要说得出，同样不许出现「已发布」", () => {
    const html = list({
      receipt: publishReceipt({
        kind: "published",
        applied: [],
        missing: ["card:已被人处理"],
        pendingLeft: 4,
        committed: [],
        unchanged: [],
        failed: [],
      }),
    });
    expect(html).toContain("card:已被人处理");
    expect(html).not.toContain("已发布");
  });
  it("队列条数与远端不一致时必须提示刷新（staleNote 相同则出空串，不添噪声）", () => {
    expect(staleNote(4, 4)).toBe("");
    expect(staleNote(2, 4)).toContain("页面 4 条 / 远端 2 条");
    const html = list({ receipt: { tone: "ok", text: "✓ 已提交 1 个文件（0 个内容相同未重复审），队列剩 2 条", lines: [staleNote(2, 4)] } });
    expect(html).toContain("请刷新");
  });
});

describe("loadReviewContext：队列与 Issue 两种读失败分流", () => {
  const pendRes = () => res(200, { sha: "S-P", encoding: "base64", content: encodeBase64Utf8(dump(pend)), updated_at: "" });
  /** 两条读并发发出，顺序不可依赖 ⇒ 按 URL 路由而不是按序列（mkFetch 的按序派发在这里会随机翻红） */
  const byUrl = (map: Record<string, unknown>, fallback: unknown) => {
    const calls: { url: string; init: Record<string, unknown> }[] = [];
    const fn = async (url: unknown, init: unknown): Promise<any> => {
      const u = String(url);
      calls.push({ url: u, init: init as Record<string, unknown> });
      const hit = Object.keys(map).find((k) => u.includes(k));
      const r = hit ? map[hit] : fallback;
      if (r instanceof Error) throw r;
      return r;
    };
    return { fn, calls };
  };
  const PENDING_KEY = "/contents/pending/changes.json";
  const ISSUE_KEY = "/issues?state=open&labels=review";

  it("401 无论来自队列还是 Issue，都归一为 authFailed——pane 据此走 markExpired", async () => {
    const a = await loadReviewContext({ repo: "o/r", token: "t", fetchImpl: mkFetch(res(401, { message: "Bad credentials" })).fn, sleep: noSleep() });
    expect(a.pending).toMatchObject({ kind: "error", status: 401 });
    expect(a.authFailed).toBe(true);
    const b = byUrl({ [PENDING_KEY]: pendRes(), [ISSUE_KEY]: res(401, { message: "Bad credentials" }) }, res(200, []));
    const c = await loadReviewContext({ repo: "o/r", token: "t", fetchImpl: b.fn, sleep: noSleep() });
    expect(c.pending.kind).toBe("loaded");
    expect(c.authFailed).toBe(true);
  });
  it("Issue 读不到 ≠ 队列读不到：403 只让批注改口、不清会话，盖章照旧", async () => {
    const f = byUrl({ [PENDING_KEY]: pendRes(), [ISSUE_KEY]: res(403, { message: "Forbidden" }) }, res(200, []));
    const out = await loadReviewContext({ repo: "o/r", token: "t", fetchImpl: f.fn, sleep: noSleep() });
    expect(out.pending.kind).toBe("loaded");
    expect(out.issueNumber).toBe(0);
    expect(out.authFailed).toBe(false); // errors.ts:31 口径：403 清会话会把限流伪装成登出
    expect(out.issueNote).toContain("Forbidden");
    expect(out.issueNote).toContain("权限不足");
  });
  it("没有开放 Issue（空列表）是正常态：issueNote 必须为空串，不能报成一次故障", async () => {
    const f = byUrl({ [PENDING_KEY]: pendRes(), [ISSUE_KEY]: res(200, []) }, res(200, []));
    const out = await loadReviewContext({ repo: "o/r", token: "t", fetchImpl: f.fn, sleep: noSleep() });
    expect(out.issueNumber).toBe(0);
    expect(out.issueNote).toBe("");
    expect(out.authFailed).toBe(false);
    expect(out.pending.kind).toBe("loaded");
  });
});

describe("外壳接线（静态钉，§1 红线 1/3）", () => {
  it("ReviewPane 里没有假 transport、每个数据面调用都显式带 FETCH，且重读只依赖两个原始值", () => {
    const src = readFileSync("src/app/admin/ReviewPane.tsx", "utf8");
    expect(src).not.toMatch(/mock|fake|Fake|mkFetch/i);
    expect(src.match(/fetchImpl: FETCH/g)?.length).toBeGreaterThanOrEqual(2); // 读队列 + 盖章
    /** 死循环钉：effect 的依赖数组若写成 `[ctx]`，AdminApp 每次渲染都交一个新对象 ⇒ 每次渲染都重打一次 GitHub 读。
     *  渲染期拿不到运行时的引用相等性，只有源码层面能钉住「依赖里只有 repo/token 两个字符串」。 */
    expect(src).toMatch(/\[repo, token\]/);
    const app = readFileSync("src/app/admin/AdminApp.tsx", "utf8");
    expect(app).toMatch(/const ctx: PaneCtx \| null = useMemo\(/); // ctx 自己也要 memo：顺带把「每次渲染 readSession 一遍」关掉
  });
  it("措辞不在组件里重写：这些字只允许出现在 uiModel.ts 与其测试里", () => {
    const src = readFileSync("src/app/admin/ReviewPane.tsx", "utf8");
    /** 扫的是整份源码文本，注释也算命中——所以「为什么只有修改/删除」这类口径说明写在 uiModel.ts 与 pending.ts 里，
     *  ReviewPane 的注释只讲布局，不复述措辞（否则措辞就有了第二处，改了 uiModel 这里不会红）。 */
    for (const s of ["档案已清", "已归档", "已退稿", "部分失败", "批准并发布", "确认删除并发布", "待审列表读取失败", "驳回", "重新读取", "新增"])
      expect(src).not.toContain(s);
  });
});

/** Tab4 的渲染事实。口径与 Tab3 一致：renderToStaticMarkup 直测纯组件，
 *  容器的真点（进格读数、点重试）由阶段 F 的裸 CDP 接管——vitest 是 node 环境，没有事件循环。 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryTable } from "@/app/admin/HistoryPane";
import {
  EMPTY_HISTORY,
  HISTORY_GATE_NOTE,
  HISTORY_HEAD,
  HISTORY_LOADING_TEXT,
  RETRY_BUTTON,
  TRIGGER_BUTTON,
  historyCaption,
  historyView,
} from "@/lib/admin/uiModel";
import type { HistoryViewState } from "@/lib/admin/uiModel";
import type { RunsResult } from "@/lib/admin/runs";

/** fixture 逐字对齐 crawler/github.mjs 的 toRunRow 输出：进行中的 run 里 durationMs 是 null，
 *  「已跑多久」由 GitHub 给，UI 不许自己拿 updatedAt 减 createdAt（那会把排队时间算进耗时）。 */
const runRow = (over: Record<string, unknown> = {}) => ({
  id: 412,
  runNumber: 412,
  event: "schedule",
  status: "completed",
  conclusion: "success",
  createdAt: "2026-09-29T12:00:00Z",
  updatedAt: "2026-09-29T12:02:41Z",
  htmlUrl: "https://github.com/hope0719/token-fbi-next/actions/runs/412",
  durationMs: 161000,
  ...over,
});
const okRuns = (runs: unknown[]) => ({ kind: "ok", runs } as RunsResult);
const errRuns: RunsResult = { kind: "error", status: 403, message: "Resource not accessible", hint: "权限不足：Actions:read" };
const table = (view: HistoryViewState, busy = false) =>
  renderToStaticMarkup(<HistoryTable view={view} busy={busy} onReload={() => {}} />);

describe("HistoryTable", () => {
  it("表头五列逐字同序，第 4 列必须是「耗时」——Task 5 的 639 档隐藏的是 nth-child(4)，列序一错就隐错列", () => {
    const html = table(historyView(okRuns([runRow()])));
    const heads = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(HISTORY_HEAD).toEqual(["运行", "触发源", "状态", "耗时", "时间（UTC）"]);
    expect(heads).toEqual([...HISTORY_HEAD]);
    expect(heads[3]).toBe("耗时");
  });
  it("行数与 caption 说的是「本次读到几次」，不是 perPage 的 5——只回 2 条还写「最近 5 次」就是谎报", () => {
    const html = table(historyView(okRuns([runRow(), runRow({ id: 2, runNumber: 411 })])));
    expect(html).toContain(historyCaption(2));
    expect(html).not.toContain("最近 5 次");
    expect(html.match(/<td/g)?.length).toBe(2 * HISTORY_HEAD.length);
  });
  it("#编号挂 run 页外链（新标签 + noreferrer）；GitHub 没给 htmlUrl 时宁可出裸字，也不出一个点不动的空链接", () => {
    const linked = table(historyView(okRuns([runRow()])));
    expect(linked).toContain('href="https://github.com/hope0719/token-fbi-next/actions/runs/412"');
    expect(linked).toContain('target="_blank"');
    expect(linked).toContain('rel="noreferrer"');
    const bare = table(historyView(okRuns([runRow({ htmlUrl: "" })])));
    expect(bare).toContain("#412");
    expect(bare).not.toContain("<a ");
  });
  it("空态用的是本格那枚「无记录」邮戳，不借 Tab1 的「档案已清」；文案引用 TRIGGER_BUTTON，跨标签按钮名只此一份", () => {
    const html = table(historyView(okRuns([])));
    expect(EMPTY_HISTORY.note).toContain(TRIGGER_BUTTON);
    expect(html).toContain('class="adm-nf"');
    expect(html).toContain(EMPTY_HISTORY.stamp);
    expect(html).toContain(EMPTY_HISTORY.heading);
    expect(html).not.toContain("档案已清");
    expect(html).not.toContain("<table");
  });
  it("读不到 ≠ 没有记录：错误支出 alert 条 + hint + 「重新读取」，绝不出空态邮戳", () => {
    const html = table(historyView(errRuns));
    expect(html).toContain('role="alert"');
    expect(html).toContain("✗ 发布历史读取失败：Resource not accessible");
    expect(html).toContain("权限不足：Actions:read");
    expect(html).toContain(RETRY_BUTTON);
    expect(html).not.toContain("adm-nf");
    expect(html).not.toContain(EMPTY_HISTORY.heading);
  });
  it("首屏在读＝只有等待文案：没有表、没有空态、根块 aria-busy（读了一半就说「还没有记录」是谎报）", () => {
    const html = table(historyView(null), true);
    expect(html).toContain(HISTORY_LOADING_TEXT);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<table");
    expect(html).not.toContain('class="adm-nf"');
  });
  it("分流四支只此一处，且 rows 由 historyRow 映射完（组件不再自己碰 runs 的原始字段）", () => {
    const v = historyView(okRuns([runRow({ status: "in_progress", conclusion: null, durationMs: null })]));
    expect(v.kind).toBe("list");
    if (v.kind !== "list") throw new Error("分流失支：in_progress 应落 list");
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({ runNumber: "#412", badgeTone: "run", badgeText: "● 进行中", duration: "—", clock: "09-29 12:00" });
    expect(v.caption).toBe(historyCaption(1));
    expect(historyView(null).kind).toBe("loading");
    expect(historyView(errRuns).kind).toBe("error");
    expect(historyView(okRuns([])).kind).toBe("empty");
  });
  it("静态钉：门禁三个数与仓内配置同源；本 pane 一处 FETCH、无 mock、错误条与空态都来自共用原子", () => {
    const lh = readFileSync(".lighthouserc.json", "utf8");
    expect(lh).toContain('"median": 2500');
    expect(lh).toContain('"median": 0.1');
    expect(lh).toContain('"minScore": 0.95');
    for (const n of ["2500", "0.1", "0.95"]) expect(HISTORY_GATE_NOTE).toContain(n);
    expect(readFileSync(".github/workflows/deploy.yml", "utf8")).toContain("needs: lighthouse");
    const src = readFileSync("src/app/admin/HistoryPane.tsx", "utf8");
    expect(src).toContain("ErrorNotice");
    expect(src).toContain("EmptyNotice");
    expect(src).toContain("isAuthError");
    /** 没有 catch：loadRuns 自己把抛错折成判别联合（runs.ts 顶部立层的原因），再包一层就是给不存在的路修灯 */
    expect(src).not.toContain("catch");
    expect(src).not.toContain("adm-statebar");
    expect(src.match(/fetchImpl: FETCH/g)?.length).toBe(1);
    expect(src).not.toMatch(/mkFetch|fake-fetch|FakeRes/);
  });
});

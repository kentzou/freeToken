/** Tab3 的用例盯四件事：
 *  ① 回执只有三态，且措辞逐字来自 triggerReceipt（§7-14：UI 不得自创第四态）；
 *  ② 请求在途＝disabled + aria-busy 全程挂着（最坏 15005ms 是实测值，不是保守估计）；
 *  ③ 被删掉的管线罗列不许以任何形式回来，留白处是读者口径（§7-1 裁决③）；
 *  ④ 「上次运行」小徽标的色档复用 historyRow 的判定，组件绝不自己按 conclusion 重算一遍。
 *  纯组件直测：renderToStaticMarkup 没有事件循环，容器的真点由阶段 F 的裸 CDP 接管。 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrawlPanel } from "@/app/admin/CrawlPane";
import { CRAWL_READER_NOTE, RETRY_BUTTON, TRIGGER_BUTTON, lastRunNote, triggerReceipt } from "@/lib/admin/uiModel";
import type { RunsResult } from "@/lib/admin/runs";

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
const errRuns: RunsResult = { kind: "error", status: 403, message: "Resource not accessible", hint: "权限不足：Actions:read" };
const panel = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <CrawlPanel busy={false} runs={null} receipt={null} onTrigger={() => {}} onReload={() => {}} {...over} />,
  );

describe("CrawlPanel", () => {
  it("三态回执一字不多：ok / 已受理未确认 / 失败，色档与 role 全由 triggerReceipt 决定", () => {
    /** E2（见本节开头校正块）：这三处原本带 `as never`，与 D10 同一族缺陷——`never` 可赋给任意类型，
     *  于是这三个实参对象的形状完全不受编译期检查，「三态」若与 triggerReceipt 的真实入参漂移也不会报错。
     *  已实测：去掉 `as never` 后这三处对象字面量正是 TriggerResult 的合法支，tsc 无新增报错。 */
    const ok = panel({ receipt: triggerReceipt({ kind: "ok", queued: true, note: "" }) });
    expect(ok).toContain('class="adm-statebar ok"');
    expect(ok).toContain("✓ 已排上：后置读看到了新 run");
    const warn = panel({ receipt: triggerReceipt({ kind: "ok", queued: false, note: "稍后刷新「发布历史」，别重复点击。" }) });
    expect(warn).toContain('class="adm-statebar warn"');
    expect(warn).toContain("⚠ 已受理但未确认");
    /** 「已受理但未确认」最坏的读法是被当成失败→再点一次→排两个 run。它必须出词「稍后刷新」，且不得出「失败」二字 */
    expect(warn).toContain("稍后刷新");
    expect(warn).not.toContain("失败");
    const bad = panel({ receipt: triggerReceipt({ kind: "error", status: 401, message: "Bad credentials", hint: "重新登录" }) });
    expect(bad).toContain('class="adm-statebar bad"');
    expect(bad).toContain('role="alert"');
    expect(bad).toContain("✗ 触发失败：Bad credentials");
  });
  it("在途＝根块与按钮同时 aria-busy，按钮 disabled；文案里没有「爬取中」这种把 202 说成 runner 在跑的话", () => {
    const busy = panel({ busy: true });
    expect(busy.match(/aria-busy="true"/g)?.length).toBe(2);
    expect(busy).toContain('disabled=""');
    expect(busy).toContain(TRIGGER_BUTTON);
    expect(busy).not.toContain("爬取中");
  });
  it("裁决③：管线实现细节零出现，留白填的是读者口径", () => {
    const html = panel();
    /** 执行期 D2（V28，Task 9 已裁并写明「这条对 Tab3/Tab4 同理：凡在文本节点里断言含引号的串，
     *  都要先过一遍把双引号换成实体形态的 replace」）：CRAWL_READER_NOTE 里那段 cron 表达式被一对
     *  ASCII 双引号包着，而 renderToStaticMarkup 会把文本节点里的双引号转义成 &quot;
     *  （react 18.3.1 实测：渲同一串只得到转义形态，字面双引号零命中）。
     *  简报正文这一行漏套 D2，按已裁口径补上转义形态——判据不减反增：整条读者口径仍须逐字出现在本 pane；
     *  且不许反过来改 Task 4 落定的措辞去迁就断言（D2 原话）。 */
    expect(html).toContain(CRAWL_READER_NOTE.replace(/"/g, "&quot;"));
    for (const w of ["括号扫描", "沙箱", "正则", "三层清洗", "linkRisk"]) {
      expect(CRAWL_READER_NOTE).not.toContain(w);
      expect(html).not.toContain(w);
    }
  });
  it("徽标四支都有话，色档来自 historyRow（在途/没有/读不到/有一条）", () => {
    expect(lastRunNote(null)).toEqual({ className: "adm-badge run", text: "正在核对上次运行…" });
    expect(lastRunNote({ kind: "ok", runs: [] } as RunsResult).text).toContain("还没有 crawl.yml 的运行记录");
    expect(lastRunNote(errRuns)).toEqual({
      className: "adm-badge bad",
      text: "没读到上次运行（Resource not accessible）：不影响这里触发，触发后请去「发布历史」核对。",
    });
    expect(lastRunNote({ kind: "ok", runs: [runRow()] } as RunsResult)).toEqual({
      className: "adm-badge ok",
      text: "上次运行 ✓ 成功 · 09-29 12:00",
    });
    expect(lastRunNote({ kind: "ok", runs: [runRow({ status: "in_progress", conclusion: null })] } as RunsResult).className).toBe("adm-badge run");
  });
  it("徽标读失败不拦触发：给一个「重新读取」入口，且按钮没有被连带禁用", () => {
    const html = panel({ runs: errRuns });
    expect(html).toContain(RETRY_BUTTON);
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("不影响这里触发");
  });
  it("触发源不猜：徽标只说 GitHub 给得出的结论，不出现「批准发布（admin）」这类本层无从知悉的话", () => {
    const html = panel({ runs: { kind: "ok", runs: [runRow({ event: "workflow_dispatch" })] } as RunsResult });
    expect(html).toContain("上次运行");
    expect(html).not.toContain("admin");
    expect(html).not.toContain("批准发布");
  });
  it("caption 那行只说「等价于 workflow_dispatch」，更新节奏交给读者口径，不重复一遍每 6 小时", () => {
    const html = panel();
    expect(html.match(/每 6 小时/g)?.length).toBe(1);
  });
  it("静态钉：本 pane 两处数据面调用都显式吃 FETCH，没有 mock 分支，401 判据走 isAuthError", () => {
    const src = readFileSync("src/app/admin/CrawlPane.tsx", "utf8");
    /** E1（见本节开头校正块）：本行原为 toBe(3)，与 Step 4 逐字块自相矛盾——逐字块里 `fetchImpl: FETCH`
     *  只出现 2 次（readBadge 的 loadRuns ＋ onTrigger 的 triggerCrawl）。第三次「数据面调用」在 pane 层不存在：
     *  triggerCrawl 内部的前后两次 runs 读发生在 lib 层（§1 红线 3 只管本 pane 显式传 transport），
     *  为凑 3 而多写一次调用才是违规。判据改为 2。 */
    expect(src.match(/fetchImpl: FETCH/g)?.length).toBe(2);
    expect(src).not.toMatch(/mkFetch|fake-fetch|FakeRes/);
    expect(src).toContain("isAuthError");
    expect(src).not.toContain("adm-statebar");
  });
});

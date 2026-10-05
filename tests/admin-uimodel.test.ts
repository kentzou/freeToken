/** 本文件是「什么状态说什么话」的唯一被测点（§1 红线 1）。
 *  三条设计前提写在这里以免误解：① 错误条正文只搬运真实 message/hint，不编造原因；
 *  ② 时间一律 UTC 并在表头标注，避免同页混用两种时区（与原型「无时区标注」是有意差异，见 D8 附注）；
 *  ③ 部分失败绝不渲染成成功（§7-18）。 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { realPending } from "./helpers/pending";
import { toRows } from "@/lib/admin/pending";
import type { ChangeRow } from "@/lib/admin/pending";
import {
  CRAWL_READER_NOTE,
  NO_REPO_NOTE,
  STATES,
  actionLabel,
  deniedText,
  errorBar,
  eventLabel,
  expiredBarText,
  fmtClock,
  fmtDuration,
  historyRow,
  loginCopy,
  loginOutcome,
  pollingNote,
  publishReceipt,
  rowKindLabel,
  sourceLine,
  stampMini,
  triggerReceipt,
} from "@/lib/admin/uiModel";

describe("12 态矩阵与登录侧", () => {
  it("验收矩阵恰好 12 态且 id 唯一（D7：原型 10 态 + 寻址失败 + 部分失败）", () => {
    expect(STATES).toHaveLength(12);
    expect(new Set(STATES.map((s) => s.id)).size).toBe(12);
    expect(STATES.map((s) => s.id)).toEqual([
      "login",
      "denied",
      "expired",
      "ready",
      "polling",
      "pendingError",
      "crawlError",
      "historyEmpty",
      "configError",
      "unconfigured",
      "noRepo",
      "publishPartial",
    ]);
  });

  it("每个态都写明触发路径与出口组件（验收文档直接引用，不许留空）", () => {
    for (const s of STATES) expect(s.trigger && s.exit && s.copy).toBeTruthy();
  });

  it("登录四态的标题各不相同，checking 不许写成登录（首屏闪登录页就是把它当登录渲了）", () => {
    expect(loginCopy("login").heading).toBe("管理后台登录");
    expect(loginCopy("checking").heading).toBe("正在核对登录状态…");
    expect(loginCopy("unconfigured").heading).toBe("后台尚未配置");
    expect(loginCopy("expired").heading).toBe("登录已过期");
  });

  it("等待中的条只陈述 GitHub 给的节奏（真实 interval）；过期黄条逐字含「关页即失效属预期行为」（原型 923）", () => {
    expect(pollingNote(5)).toBe("⟳ 正在等待 GitHub 授权…（每 5 秒向 GitHub 核对一次）");
    expect(pollingNote(3)).toContain("每 3 秒");
    expect(expiredBarText("GitHub 已拒绝该凭证（401）：请重新完成 Device Flow 登录")).toContain("关页即失效属预期行为");
  });

  it("登录结局四种终态各有措辞、都带真实核对次数；成功不占文案（空串＝不出条）", () => {
    expect(loginOutcome({ kind: "access_denied", polls: 4 })).toBe("⚠ 你在 GitHub 侧点了「取消」（已核对 4 次）：本次登录未授权，可随时重新发起。");
    expect(loginOutcome({ kind: "expired", polls: 99 })).toContain("一次性代码已过期（已核对 99 次）");
    expect(loginOutcome({ kind: "timeout", polls: 3 })).toContain("等待超时");
    expect(loginOutcome({ kind: "fatal", error: "incorrect_client_credentials", message: "Bad client secret", polls: 1 })).toContain("incorrect_client_credentials");
    expect(loginOutcome({ kind: "token", token: "t", scope: "", polls: 7 })).toBe("");
  });

  it("缺仓引导条写明两个构建期变量名（运维照这句话就能自己找到出口）", () => {
    expect(NO_REPO_NOTE).toContain("NEXT_PUBLIC_SITE_URL");
    expect(NO_REPO_NOTE).toContain("NEXT_PUBLIC_REPO");
  });

  it("拒绝页文案带真实 login 与白名单出处，不写死示例名", () => {
    expect(deniedText("octocat", "不在名单")).toEqual({ login: "octocat", heading: "你不在这间值班室的名单上", note: "不在名单" });
  });
});

describe("错误条：正文来自真实应答，hint 来自 classifyError", () => {
  it("四个主题各有其措辞，tone 统一是 bad/role=alert", () => {
    const bar = errorBar("pending", "HTTP 403", 403, "权限不足");
    expect(bar).toEqual({ className: "adm-statebar bad", role: "alert", text: "✗ 待审列表读取失败：HTTP 403", hint: "权限不足" });
  });
  it("status=0 是「网络不可达」而不是「HTTP 0」", () => {
    expect(errorBar("crawl", "fetch failed", 0, "网络不可达").text).toBe("✗ 触发失败：fetch failed（网络不可达，未发出请求）");
  });
});

describe("Tab1 行语义", () => {
  const row = (over: Partial<ChangeRow>): ChangeRow => ({
    id: "card:A",
    kind: "card",
    kindLabel: "情报卡",
    name: "A",
    removal: false,
    whole: false,
    fields: [],
    extraFields: 0,
    beforeText: "",
    afterText: "",
    ...over,
  });
  it("真实 pending 的每一行都归「修改/删除」，绝不出现「新增」（新增是自动发布的，队列里没有）", () => {
    const rows = toRows(realPending());
    expect(rows.length).toBeGreaterThanOrEqual(4); // fixture 的四种真实形态都在
    expect(rows.some((r) => r.removal)).toBe(true);
    expect(rows.some((r) => r.whole)).toBe(true);
    for (const r of rows) {
      expect(["card", "watch", "rules"]).toContain(r.kind);
      expect(rowKindLabel(r)).not.toContain("新增");
      expect(actionLabel(r)).toContain("发布");
    }
  });
  it("删除类按钮措辞单独一档（原型 986「确认删除并发布」）", () => {
    expect(actionLabel(row({}))).toBe("批准并发布");
    expect(actionLabel(row({ removal: true }))).toBe("确认删除并发布");
  });
  it("行头只有「修改/删除」两种前缀；whole 只影响差异渲染，不改行头口径", () => {
    expect(rowKindLabel(row({}))).toBe("修改 · 情报卡");
    expect(rowKindLabel(row({ removal: true }))).toBe("删除 · 情报卡");
    expect(rowKindLabel(row({ whole: true, kindLabel: "规则表" }))).toBe("修改 · 规则表");
  });
  it("盖章小邮戳两枚：已归档 / 已退稿（原型 JS 1355）", () => {
    expect(stampMini(true)).toBe("已归档");
    expect(stampMini(false)).toBe("已退稿");
  });
  it("来源行只用数据面真给的东西：sha 缺失写「指纹未记录」，Issue 号缺失整段省略", () => {
    const p = realPending();
    const line = sourceLine(p, null);
    expect(line).toContain(`检测于 ${p.detectedAt}`);
    expect(line).not.toContain("Issue");
    expect(sourceLine({ ...p, upstreamSha: null }, 42)).toContain("指纹未记录");
  });
});

describe("发布/触发/历史三张回执", () => {
  it("全成功：提交数、跳过数、队列剩余都进正文（不写「发布成功」这种无法核对的的空话）", () => {
    const r = publishReceipt({
      kind: "published",
      applied: [{ action: "approve", id: "card:A" }],
      missing: [],
      pendingLeft: 0,
      committed: ["data/tokens.json"],
      unchanged: ["data/rules.json"],
      failed: [],
    } as any);
    expect(r.tone).toBe("ok");
    expect(r.text).toBe("✓ 已提交 1 个文件（1 个内容相同未重复审），队列剩 0 条");
  });
  it("部分失败：tone 落 bad，绝不当成功（§7-18 的硬要求）", () => {
    const r = publishReceipt({
      kind: "published",
      applied: [],
      missing: [],
      pendingLeft: 2,
      committed: ["data/tokens.json"],
      unchanged: [],
      failed: [{ path: "data/donots.json", hint: "sha 过期" }],
    } as any);
    expect(r.tone).toBe("bad");
    expect(r.text).toContain("⚠ 部分失败：已提交 1 个，失败 1 个");
    expect(r.lines).toEqual([
      "data/donots.json：sha 过期",
      "待审队列仍剩 2 条：失败的文件未被覆盖，重试是幂等的（已提交的文件会走「内容相同不重写」）。",
    ]);
  });
  it("空选择与白名单拒绝各有自己的话，都不写成失败也不写成成功", () => {
    expect(publishReceipt({ kind: "noop", hint: "一条也没选中" } as any)).toEqual({ tone: "info", text: "ℹ 一条也没选中", lines: [] });
    expect(publishReceipt({ kind: "denied", hint: "login 不在名单" } as any).text).toBe("⛔ 白名单复核未通过：login 不在名单");
  });
  it("触发三态：queued / 已受理未确认（原样搬运 note）/ error", () => {
    expect(triggerReceipt({ kind: "ok", queued: true, note: "" } as any)).toEqual({ tone: "ok", text: "✓ 已排上：后置读看到了新 run", lines: [] });
    expect(triggerReceipt({ kind: "ok", queued: false, note: "别重复点击" } as any)).toEqual({ tone: "warn", text: "⚠ 已受理但未确认", lines: ["别重复点击"] });
    expect(triggerReceipt({ kind: "error", status: 401, message: "Bad credentials", hint: "重新登录" } as any)).toEqual({
      tone: "bad",
      text: "✗ 触发失败：Bad credentials",
      lines: ["重新登录"],
    });
  });
  it("历史行：进行中无耗时（—），成功/失败/取消各有徽标；未知触发源原样显示", () => {
    expect(historyRow({ id: 1, runNumber: 408, event: "workflow_dispatch", status: "in_progress", conclusion: null, createdAt: "2026-09-28T09:31:00Z", updatedAt: "2026-09-28T09:32:00Z", htmlUrl: "h", durationMs: null })).toEqual({
      runNumber: "#408",
      event: "手动触发",
      badgeTone: "run",
      badgeText: "● 进行中",
      duration: "—",
      clock: "09-28 09:31",
      htmlUrl: "h",
    });
    /** 三档徽标的档位必须齐：Tab3 的「上次运行」小徽标（Task 10 的 lastRunNote）直接复用这里的 badgeTone，
     *  这里少一档，那边就会自己去重算 conclusion→颜色——同一件事又出两份判断。 */
    expect(historyRow({ runNumber: 412, event: "schedule", status: "completed", conclusion: "success", createdAt: "2026-09-29T12:00:00Z", durationMs: 161000, htmlUrl: "h", id: 3 })).toMatchObject({ badgeTone: "ok", badgeText: "✓ 成功" });
    expect(historyRow({ runNumber: 409, event: "issue_comment", status: "completed", conclusion: "cancelled", createdAt: "2026-09-28T12:00:00Z", durationMs: null, htmlUrl: "h", id: 2 })).toMatchObject({ badgeTone: "bad", badgeText: "⊘ 已取消" });
    expect(historyRow({ runNumber: 409, event: "issue_comment", status: "completed", conclusion: "failure", createdAt: "2026-09-28T12:00:00Z", durationMs: 62000, htmlUrl: "h", id: 2 }).badgeText).toBe("✗ 失败");
    expect(eventLabel("schedule")).toBe("crawl.yml 自动");
    expect(eventLabel("merge_group")).toBe("merge_group");
  });
  it("耗时与时刻的格式口径：161s→2m41s、9s→9s、非有限值→—；时刻一律 UTC", () => {
    expect(fmtDuration(161000)).toBe("2m41s");
    expect(fmtDuration(9000)).toBe("9s");
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(Number.NaN)).toBe("—");
    expect(fmtClock("2026-09-29T12:04:00Z")).toBe("09-29 12:04");
    expect(fmtClock("不是时间")).toBe("—");
  });
});

describe("Tab3 读者口径说明（用户裁决③）", () => {
  it("文案里的更新频率与真实 cron 同源：cron 改了这条必须一起改", () => {
    expect(CRAWL_READER_NOTE).toContain("hope0719/token-fbi");
    expect(CRAWL_READER_NOTE).toContain("每 6 小时");
    const yml = readFileSync(".github/workflows/crawl.yml", "utf8");
    const cron = yml.match(/cron:\s*"([^"]+)"/)?.[1];
    // 分钟位 23 出自 main 的 8b403de（把调度挪出整点，规避官方点名的 runner 高负载时刻）；
    // 这里继续写死完整字面而不改成「只核频率」——这条钉的全部价值就是逼着改 cron 的人同时改读者文案。
    expect(cron).toBe("23 */6 * * *");
    expect(CRAWL_READER_NOTE).toContain(cron);
  });
  it("说明必须区分「新增自动发布 / 修改与删除待审」两条路，与 run.mjs 的分类一致", () => {
    expect(CRAWL_READER_NOTE).toContain("新增");
    expect(CRAWL_READER_NOTE).toContain("待审");
  });
});

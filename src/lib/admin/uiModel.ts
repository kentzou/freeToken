/** 「什么状态说什么话」的唯一出口（§1 红线 1 的新增条目）。本文件零 React、零 DOM、零 fetch：
 *  输入是 auth/pending/publish/trigger/runs 各层已经产出的判别联合，输出是组件可直接摊开的属性与字符串。
 *  为什么值得单列一层：计划 3 把判断都做在数据面，但「queued:false 该显示成功还是提示」这类口径
 *  一旦散进四个 pane，同一个态就会出现四种措辞——那正是后台最伤信任的错（§7-18）。
 *  时间一律 UTC 且表头标注（D8 附注）：本页同时展示 run 时刻与核验日期，混用时区会让「09-29 12:00 的运行」
 *  看起来比「09-29」的核验更早或更晚，而 GitHub 返回的 ISO 串本来就是 UTC。 */
import type { AdminView, WaitResult } from "./auth";
import type { ChangeRow, PendingJson, ReviewContext } from "./pending";
import type { PublishResult } from "./publish";
import type { RunsResult } from "./runs";
import type { TriggerResult } from "./trigger";

/** 12 态验收矩阵（D7）：id 与计划 3 §7-2/§7-6 的口径一一对应，Task 14 的文档表格由此导出，
 *  避免「文档一套态、代码一套态」。trigger=怎么真实触达，exit=渲染出口，copy=措辞出处。
 *  邮戳只有两族，与计划 3 §7-5 的四态对应关系如下（D8 的硬要求，后来者不许新造第三套）：
 *  ok→行内小邮戳「已归档 / 已退稿」（`stampMini`）；missing→整页大邮戳两枚——Tab1 队列清空的「档案已清」
 *  与 Tab4 链路没跑过的「无记录」（`EMPTY_HISTORY`，Task 11 追加），二者措辞分家见 V15；
 *  error→拒绝页的「未授权」与各 pane 的错误条（`deniedText` / `errorBar`）；stale→凭证过期黄条（`expiredBarText`）。 */
export const STATES: { id: string; name: string; trigger: string; exit: string; copy: string }[] = [
  { id: "login", name: "未登录", trigger: "清 sessionStorage 后刷新", exit: "LoginPanel", copy: "loginCopy(login)" },
  { id: "denied", name: "白名单拒绝", trigger: "非白名单身份完成 Device Flow（线上首查，本机以 resolveView 真序列证）", exit: "DeniedPanel", copy: "deniedText + state.hint" },
  { id: "expired", name: "凭证过期", trigger: "会话 expiresAt 置为过去（本地）/ 撤销 token（线上）", exit: "两条：首屏即过期＝LoginPanel（登录已过期＋重新发起）；用法中在途请求 401＝Workbench 顶部黄条＋面板停摆", copy: "expiredBarText / loginCopy(expired)" },
  { id: "ready", name: "已登录工作台", trigger: "白名单身份登录成功", exit: "Workbench + 四 pane", copy: "TABS" },
  { id: "polling", name: "登录轮询中", trigger: "点「发起 Device Flow 登录」后 waitLogin 在途", exit: "LoginPanel 状态条", copy: "pollingNote(interval)" },
  { id: "pendingError", name: "待审读取失败", trigger: "Contents 读返回 403", exit: "ReviewPane 错误条", copy: "errorBar(pending)" },
  { id: "crawlError", name: "触发失败", trigger: "dispatch 返回 401", exit: "CrawlPane 错误条", copy: "triggerReceipt(error)" },
  { id: "historyEmpty", name: "历史清空", trigger: "runs 应答为空数组", exit: "HistoryPane 空态", copy: "EMPTY_HISTORY（邮戳「无记录」；与 Tab1 的「档案已清」分开——两格说的不是一件事）" },
  { id: "configError", name: "配置保存失败", trigger: "Contents PUT 返回 422", exit: "ConfigPane 错误条", copy: "errorBar(config)" },
  { id: "unconfigured", name: "未配置 OAuth", trigger: "oauthClientId 为空的 config；或外壳压根没读到 config（Task 6 catch 归口，执行期 C7）", exit: "LoginPanel 引导条（blocked 分支：禁按钮 + 搬运 state.hint）", copy: "loginCopy(unconfigured)" },
  { id: "noRepo", name: "后台寻址失败", trigger: "NEXT_PUBLIC_REPO 与 SITE_URL 都取不到仓", exit: "LoginPanel 引导条", copy: "loginCopy(noRepo)" },
  { id: "publishPartial", name: "发布部分失败", trigger: "第二个文件 PUT 抛 409", exit: "ReviewPane 回执", copy: "publishReceipt(failed)" },
];

export const loginCopy = (view: AdminView | "noRepo"): { heading: string; note: string } => {
  if (view === "checking") return { heading: "正在核对登录状态…", note: "读取本地会话并向 GitHub 确认身份，无需操作。" };
  if (view === "unconfigured") return { heading: "后台尚未配置", note: "没读到 config/site-config.json，或其中的 oauthClientId 为空——两种情况下任何登录请求都不该发出。" };
  if (view === "noRepo") return { heading: "后台尚未配置仓库地址", note: "构建期未注入 NEXT_PUBLIC_SITE_URL，也没设 NEXT_PUBLIC_REPO。" };
  if (view === "expired") return { heading: "登录已过期", note: "请重新完成 Device Flow 登录。" };
  return { heading: "管理后台登录", note: "GitHub Device Flow —— 仅需 OAuth App 的 client_id（公开值），无 client secret，纯静态可实现。" };
};

/** 等待中的进度条：只陈述「节奏」这个能核对的事实——节奏来自 GitHub 应答里的 interval，
 *  由服务端强制（太频繁会被 slow_down）。
 *  与原型 900 的有意差异：原型写「已轮询 N 次」，但 waitLogin 只在终态回传 polls，等待中无法核对，
 *  写一个不会变的数字等于谎报进度（§1 红线 7）；核对次数改由 loginOutcome 在结局条里给出。 */
export const pollingNote = (interval: number) => `⟳ 正在等待 GitHub 授权…（每 ${interval} 秒向 GitHub 核对一次）`;

/** 登录结局条：五种 WaitResult 各有话，成功返回空串（调用方据此不出条）。
 *  四种失败话术都必须能回答「下一步做什么」——只有「取消」和「过期」是可以原地重试的，
 *  fatal 里带 error 原文是因为 incorrect_client_credentials 之类的错重登多少次都不会好。 */
export function loginOutcome(res: WaitResult): string {
  if (res.kind === "token") return "";
  if (res.kind === "access_denied") return `⚠ 你在 GitHub 侧点了「取消」（已核对 ${res.polls} 次）：本次登录未授权，可随时重新发起。`;
  if (res.kind === "expired") return `⚠ 一次性代码已过期（已核对 ${res.polls} 次）：请重新发起 Device Flow。`;
  if (res.kind === "timeout") return `⚠ 等待超时（已核对 ${res.polls} 次，设备码有效期内未拿到令牌）：可重新发起，或改用仓库 Issue 的 /approve 路径。`;
  return `⚠ 登录未完成：${res.error}（${res.message}），已核对 ${res.polls} 次。`;
}

/** 寻址失败（D4 的 noRepo 态）：这句话是运维唯一能拿来自救的出口，两个变量名要写全。
 *  unconfigured 态不在这里出文案——resolveView 的 hint 已是唯一实现，组件直接搬运。 */
export const NO_REPO_NOTE =
  "✗ 后台尚未配置仓库地址：构建期需注入 NEXT_PUBLIC_SITE_URL（deploy.yml 已接），自定义域可另设 NEXT_PUBLIC_REPO。";

export const expiredBarText = (hint: string) =>
  `⚠ 登录凭证已过期：${hint || "请重新完成 Device Flow 登录"}（token 仅存 sessionStorage，关页即失效属预期行为）。`;

export const deniedText = (login: string, hint: string) => ({
  login,
  heading: "你不在这间值班室的名单上",
  note: hint,
});

export const ERROR_SUBJECT = { pending: "待审列表读取失败", config: "保存失败", configLoad: "配置读取失败", crawl: "触发失败", history: "发布历史读取失败" } as const;

export interface ErrorBar {
  className: string;
  role: "alert";
  text: string;
  hint: string;
}

/** status=0 特判：`classifyError` 对「fetch 直接 reject」给的就是 0，写成「HTTP 0」会让人去查一个不存在的状态码。 */
export function errorBar(subject: keyof typeof ERROR_SUBJECT, message: string, status: number, hint: string): ErrorBar {
  const tail = status === 0 ? "（网络不可达，未发出请求）" : "";
  return { className: "adm-statebar bad", role: "alert", text: `✗ ${ERROR_SUBJECT[subject]}：${message}${tail}`, hint };
}

/** 行头徽标文本：真实队列只有 修改/删除 两种来路（run.mjs 只把 changed+removed 并入），
 *  所以这里绝不出现「新增」——原型 Tab1 那张新增卡是演示形态（§7-10）。 */
export const rowKindLabel = (row: ChangeRow) => `${row.removal ? "删除" : "修改"} · ${row.kindLabel}`;

export const actionLabel = (row: ChangeRow) => (row.removal ? "确认删除并发布" : "批准并发布");

/** 行内小邮戳两枚（NOTES.admin 1169 的「已归档 / 已退稿」） */
export const stampMini = (approved: boolean) => (approved ? "已归档" : "已退稿");

export interface Receipt {
  tone: "ok" | "warn" | "bad" | "info";
  text: string;
  lines: string[];
}

export function publishReceipt(res: PublishResult): Receipt {
  if (res.kind === "denied") return { tone: "bad", text: `⛔ 白名单复核未通过：${res.hint}`, lines: [] };
  if (res.kind === "noop") return { tone: "info", text: `ℹ ${res.hint}`, lines: [] };
  const lines: string[] = [];
  if (res.missing.length) lines.push(`指令指向的条目已不在队列：${res.missing.join("、")}`);
  for (const f of res.failed) lines.push(`${f.path}：${f.hint}`);
  if (res.failed.length) {
    lines.push(`待审队列仍剩 ${res.pendingLeft} 条：失败的文件未被覆盖，重试是幂等的（已提交的文件会走「内容相同不重写」）。`);
    return { tone: "bad", text: `⚠ 部分失败：已提交 ${res.committed.length} 个，失败 ${res.failed.length} 个`, lines };
  }
  return {
    tone: "ok",
    text: `✓ 已提交 ${res.committed.length} 个文件（${res.unchanged.length} 个内容相同未重复审），队列剩 ${res.pendingLeft} 条`,
    lines,
  };
}

export function triggerReceipt(res: TriggerResult): Receipt {
  /** 主语搬 ERROR_SUBJECT.crawl 而不是再手写一遍「触发失败」：那四个主体字符串是同一张表，
   *  Tab3 的错误条与 Tab1/2/4 的只隔一个 pane，改天统一措辞时不许漏掉一支。 */
  if (res.kind === "error") return { tone: "bad", text: `✗ ${ERROR_SUBJECT.crawl}：${res.message}`, lines: [res.hint] };
  if (res.queued) return { tone: "ok", text: "✓ 已排上：后置读看到了新 run", lines: [] };
  return { tone: "warn", text: "⚠ 已受理但未确认", lines: [res.note] };
}

/** 触发源中文口径：workflow_dispatch 有两条来源（后台点 / 线上手工点），GitHub 的 event 不区分，
 *  所以这里只说「手动触发」，绝不写「admin 批准发布」那种本层无从得知的话（§1 红线 7）。 */
const EVENT_LABEL: Record<string, string> = {
  workflow_dispatch: "手动触发",
  schedule: "crawl.yml 自动",
  push: "数据提交触发",
  issue_comment: "审核指令触发",
};
export const eventLabel = (event: string) => EVENT_LABEL[event] ?? event;

export interface HistoryRowView {
  runNumber: string;
  event: string;
  /** 只给语义档位，不给类名：拼成 `adm-badge ${badgeTone}` 是组件的事。
   *  措辞层负责 class 会把档位绑死在一个类名前缀上，还会让 Task 5 的类名普查看不见它（它只扫 tsx 里的字符串字面量）。
   *  这一档同时被 Task 10 的 lastRunNote 复用——Tab3 的徽标绝不允许自己重算一遍 conclusion→颜色。 */
  badgeTone: "ok" | "bad" | "run";
  badgeText: string;
  duration: string;
  clock: string;
  htmlUrl: string;
}

/** 历史行的输入形状由 runs.ts 与 crawler/github.mjs 的 toRunRow 定稿（durationMs 对进行中为 null）；
 *  本函数只做展示映射，不重算耗时——那会把「已跑多久」当成耗时。 */
export function historyRow(run: Record<string, any>): HistoryRowView {
  const done = run.status === "completed";
  const c = String(run.conclusion ?? "");
  let badgeTone: HistoryRowView["badgeTone"] = "run";
  let badgeText = "● 进行中";
  if (done && c === "success") {
    badgeTone = "ok";
    badgeText = "✓ 成功";
  } else if (done && c === "failure") {
    badgeTone = "bad";
    badgeText = "✗ 失败";
  } else if (done && c === "cancelled") {
    badgeTone = "bad";
    badgeText = "⊘ 已取消";
  } else if (done) {
    badgeTone = "run";
    badgeText = `℠ ${c || "已结束"}`;
  }
  return {
    runNumber: `#${run.runNumber ?? "?"}`,
    event: eventLabel(String(run.event ?? "")),
    badgeTone,
    badgeText,
    duration: fmtDuration(run.durationMs),
    clock: fmtClock(String(run.created_at ?? run.createdAt ?? "")),
    htmlUrl: String(run.htmlUrl ?? run.html_url ?? ""),
  };
}

export function fmtDuration(ms: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

export function fmtClock(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toISOString().slice(5, 16).replace("T", " ");
}

/** 队列来源行：只搬运 pending 里真实存在的三个量（上游指纹、检测时刻、开放审核 Issue 号）。
 *  Issue 号来自 openReviewIssue，没有就整段省略——写「Issue #—」比不写更容易被读成编号是「—」。 */
export function sourceLine(pending: PendingJson, issueNumber: number | null): string {
  const parts = [`来源：上游指纹 ${pending.upstreamSha ?? "指纹未记录"}`, `检测于 ${pending.detectedAt || "时刻未记录"}`];
  if (issueNumber) parts.push(`审核 Issue #${issueNumber}`);
  return parts.join(" · ");
}

/** Tab3 的读者口径说明（用户裁决③替换原型 1043 的管线罗列）。
 *  三个事实全部可核：cron 出自 .github/workflows/crawl.yml（本文件有测试盯着），
 *  新增自动发布 / 修改删除待审出自 crawler/run.mjs 的 syncOnce，deploy 自动重建出自 deploy.yml 的 paths。
 *  故意不写「每 6 小时一定成功」——schedule 在 GitHub 侧会有延迟，措辞只承诺节奏设定。 */
export const CRAWL_READER_NOTE =
  "数据从哪来：上游 hope0719/token-fbi 的公开 data.json，以及每个条目自己的平台官网直连核验。多久更新：crawl.yml 按 cron \"23 */6 * * *\" 每 6 小时一次，也可点上面的按钮手动触发一次。上游新增条目自动发布；已有条目的修改与删除会进「待审变更」等你盖章。你在这里保存或盖章的每个动作都会真实 commit 回仓库，deploy.yml 看到 data/ 或 config/ 变化后自动重建线上站点。";

/* ── Tab1「待审变更」的四支分流与措辞（Task 7）────────────────────────────── */

export const REVIEW_LOADING_TEXT = "正在读取待审队列…";
export const RETRY_BUTTON = "重新读取";
export const REJECT_LABEL = "驳回";
export const ISSUE_LINK_LABEL = "打开审核 Issue";

/** 措辞里绝不含「批准并发布」那四字：Task 7 的用例钉的是「批准并发布」在页面上出现 3 次
 *  ＝三条非删除行的按钮。全量按钮若共用这个词根，那条断言就退化成「数实现字数」。 */
export const approveAllLabel = (n: number) => `一次批准全部 ${n} 条`;

export const WHOLE_CAPTION = "整表对比：规则表按整表审批，不逐条划线";
export const WHOLE_ABSENT = "（这一侧没有这张表）";

/** 空态三件套。大邮戳复用 app.css 的 .stamp（D8：不新造第三套邮戳），日期那一行了无实事可写，
 *  所以空态只出 strong 不出 em——StampBadge 的 date 是必填项，它服务的是「核验于某日」，不是「档案已清」。 */
export const EMPTY_REVIEW = {
  stamp: "档案已清",
  heading: "没有待审的变更",
  note: "上游这一轮没有需要人工确认的改动。新增条目由 crawl.yml 直接自动发布；已有条目的修改与删除才会进这里等你盖章。",
};

export const extraFieldsNote = (n: number) => `另有 ${n} 处字段差异未列出，逐条核对请打开审核 Issue`;

/** Issue 号决定盖章会留下什么：有 Issue 才有指令与回执，没有 Issue 只写文件。
 *  「/approve」必须出现在批注里——它是 runReview 唯一认的指令形态，运维在这里读不到它，就会去 Issue 里写中文。
 *  第二参 `issueNote`（执行期 C8 新增，登记见 V26）把「读 Issue 失败」和「确实没有开放 Issue」分家：
 *  `loadReviewContext` 里 issueNote 非空串就是那条读失败，而 403（缺 Issues:write）时 `authFailed` 仍为 false，
 *  批注是唯一能看出区别的地方。把「没读到」说成「确实没有」违反 §0 红线 7 与计划 3 §7-1 的事实性口径。
 *  「Issue 侧的回执与关单会跳过」是实测行为不是推测：`crawler/review.mjs:111-113` 的 `if (issueNumber)` 才发评论与关单。 */
export const approveNote = (issueNumber: number | null, issueNote: string = "") =>
  issueNumber
    ? `盖章即向 Issue #${issueNumber} 下发 /approve 与 /reject 指令，并把回执与关单一并做完。`
    : issueNote
      ? `读取审核 Issue 失败：${issueNote}——这一轮判不出有没有开放 Issue。盖章仍会真实提交数据文件，但 Issue 侧的回执与关单会跳过。`
      : "当前没有开放的审核 Issue：数据文件照样会真实提交，只是没有回执可留。要留痕请先开一张带 review 标签的 Issue。";

/** 盖章成功后重读回来的条数与写面报的 pendingLeft 不一致，才说明「你看的时候别人也动了」。
 *  一致时出空串——组件里不许把空串渲成一行噪声（调用点用 `note ? … : null` 兜）。 */
export const staleNote = (pendingLeft: number, rowCount: number) =>
  pendingLeft === rowCount ? "" : `队列在你阅读期间又被改动：页面 ${rowCount} 条 / 远端 ${pendingLeft} 条，请刷新后再盖章。`;

/** publishApprovals 只兜「单个文件写失败」；loadCurrentData / runReview 自己抛的会穿到 pane 的 catch。
 *  这句话要说的是「本次可能只写出去了一半」，绝不是「失败且什么都没发生」——前者能让人去核对，后者会让人再点一次。 */
export const publishCrash = (message: string, hint: string): Receipt => ({
  tone: "bad",
  text: `⚠ 盖章通路中途异常：${message}`,
  lines: [`${hint} 已提交的文件不会重复提交（重试是幂等的），刷新后以队列实际条数为准。`],
});

export type ReviewViewState =
  | { kind: "loading"; text: string }
  | { kind: "empty" }
  | { kind: "error"; bar: ErrorBar }
  | { kind: "list"; rows: ChangeRow[]; source: string; note: string };

/** 四支分流只此一处（§1 红线 1）。ctx 为 null 是「还没回」＝loading，
 *  与 pending.kind==="empty" 的「回来了、确实是空」是两件事，共用一支就会把加载过程渲成结论。 */
export function reviewView(ctx: ReviewContext | null, rows: ChangeRow[]): ReviewViewState {
  if (!ctx) return { kind: "loading", text: REVIEW_LOADING_TEXT };
  const p = ctx.pending;
  if (p.kind === "error") return { kind: "error", bar: errorBar("pending", p.message, p.status, p.hint) };
  if (p.kind === "empty") return { kind: "empty" };
  // C8：批注必须读 ctx.issueNote——issueNumber 为 0 有两种来路（确实没有 / 没读到），分流不能替它挑一个
  return { kind: "list", rows, source: sourceLine(p.pending, ctx.issueNumber || null), note: approveNote(ctx.issueNumber || null, ctx.issueNote) };
}

/* ── Tab2「变现配置」──────────────────────────────────────────── */

export const SAVE_BUTTON = "保存并 commit"; // 原型 1027 逐字（执行期 D9：原写 1029 差两行）：commit 这个词要留着，它说的是真的会提交一个 commit
export const NO_CHANGE_NOTE = "没有待保存的改动";
export const TYPE_UNSET = "（不覆盖）";
/** 等待句第三格：Tab2 读的是仓内配置文件，与「待审队列」「crawl.yml 的运行记录」不是同一个对象，
 *  共用一句会让「正在读取…」在三格里含义漂移（同 `HISTORY_LOADING_TEXT` 上方那条理由）。终审 I-1。 */
export const CONFIG_LOADING_TEXT = "正在读取 config/site-config.json…";
/** 行内 meta 报的是「当前覆盖值」，下拉那颗 `TYPE_UNSET` 报的是「选了会怎样」——两个语义角色、两种措辞，
 *  但出口仍只有 uiModel 这一处（§1 红线 1 约束的是出口唯一，不是条数唯一）。终审 I-1 裁决注，勿再合并。 */
export const TYPE_UNSET_META = "无";
/** 与上一行同角色：都是「这一格没有覆盖值」的兜底措辞（状态→文案映射，红线 1 射程内），
 *  所以同样不许在组件里各写一遍。复审 I-① 同族补钉依据。 */
export const CATEGORY_UNSET_META = "未标注";
export const inviteAriaLabel = (name: string) => `${name} 邀请码`;
export const hideAriaLabel = (name: string) => `hide ${name} 卡（开为隐藏）`;

/** 原型 1028 那颗「+ 新增合作卡」按钮不在这里做，且必须说清为什么（执行期 D9：原写 1030 差两行）：
 *  crawler/clean.mjs:127 的 applySiteConfig 遍历的是 cfg.cards 的键、把它们打到**同名的受版卡**上；
 *  一个只存在于 config 里的新卡名没有任何渲染出口——点了保存会真的 commit，页面上却什么都不会出现。
 *  「新增卡」的正路是数据面（上游爬取或手工改 data/tokens.json 走审核）。 */
export const ADD_CARD_NOTE =
  "新增卡片不在这里做：这份配置只能覆盖已有卡片的展示字段，写一个库里没有的卡名会保存成功但页面上不出现（卡片本体属于 data/ 数据面，走上游爬取或审核合入）。";

export function configSaved(res: { kind: string }): Receipt {
  if (res.kind === "unchanged") return { tone: "info", text: `ℹ ${NO_CHANGE_NOTE}：远端内容与提交结果逐字相同，本次没有产生 commit`, lines: [] };
  return { tone: "ok", text: "✓ 已提交 config/site-config.json，deploy.yml 看到 config/ 变化后自动重建线上站点", lines: [`提交号 ${String(res.kind === "committed" ? (res as { commitSha?: string }).commitSha ?? "未返回" : "")}`.trim()] };
}

/* ── Tab3「触发爬取」──────────────────────────────────────────── */

/** 按钮文本取自原型 1041 逐字。为什么没有「爬取中…」这一档：GitHub 的 workflow_dispatch 只回 202 空应答，
 *  在途期间我们能知道的只有「请求还没返回」；说「爬取中」等于把「已提交触发请求」说成「runner 正在跑」——
 *  而 runner 可能还在排队（§1 红线 7）。 */
export const TRIGGER_BUTTON = "立即爬取一次";

/** 「上次运行」小徽标：RunsResult 的三种可能（没读到 / 读失败 / 读到）都要有话。
 *  为什么不给一个空串了事：徽标消失会被读成「这个 workflow 从没跑过」，那是把「我们没读到」说成「它没有」——
 *  runs.ts 顶部立这一层就是为了不让组件把两种东西混成一格。
 *  读失败也照此办理：它不构成禁用触发按钮的理由（dispatch 不需要先读到 runs）。 */
export function lastRunNote(res: RunsResult | null): { className: string; text: string } {
  if (res === null) return { className: "adm-badge run", text: "正在核对上次运行…" };
  if (res.kind === "error")
    return { className: "adm-badge bad", text: `没读到上次运行（${res.message}）：不影响这里触发，触发后请去「发布历史」核对。` };
  if (!res.runs.length) return { className: "adm-badge run", text: "还没有 crawl.yml 的运行记录" };
  const row = historyRow(res.runs[0]); // 取第一条＝最新：GitHub 的 runs 按倒序返回，trigger.ts 的 before/after 对照用的是同一个前提
  return { className: `adm-badge ${row.badgeTone}`, text: `上次运行 ${row.badgeText} · ${row.clock}` }; // 色档与文字都搬 historyRow，这里不重算 conclusion
}

/* ── Tab4「发布历史」的分流与措辞（Task 11）────────────────────────────── */

/** 列序是契约，不是排版选择：Task 5 的 639 档隐藏 `.adm-hist` 的第 4 列（耗时），
 *  这里一改序，手机上隐掉的就是「状态」。要改这一行必须同时改那条 @media。 */
export const HISTORY_HEAD = ["运行", "触发源", "状态", "耗时", "时间（UTC）"] as const;

/** 等待句与 Tab1 的「正在读取待审队列…」分开写：两格读的不是同一个东西，
 *  共用一句会让「正在读取…」在两个面板里含义漂移。 */
export const HISTORY_LOADING_TEXT = "正在读取 crawl.yml 的运行记录…";

/** caption 报的是实际读到的条数，不是 perPage：GitHub 在限流时会回少于请求数的 run，
 *  写死「最近 5 次」等于把「只读到 2 条」说成「总共只跑过 2 次」。 */
export const historyCaption = (n: number) => `Workflow runs（本次读到 ${n} 次）`;

/** 邮戳两格分开：Tab1 的「档案已清」说的是队列被清空，这一枚「无记录」说的是这条链路还没跑过。
 *  note 里引用 TRIGGER_BUTTON，是为了让「那个按钮叫什么」在四个 pane 之间只有一份真值。 */
export const EMPTY_HISTORY = {
  stamp: "无记录",
  heading: "还没有发布记录",
  note: `点「${TRIGGER_BUTTON}」排一次队，或等 crawl.yml 的自动运行跑完，这里就会出现记录。`,
};

/** 三个阈值照抄 .lighthouserc.json（LCP 与 CLS 用 maxNumericValue 卡上限、无障碍用 minScore 卡下限，
 *  数值 2500 / 0.1 / 0.95）；
 *  「不带病上线」出自 deploy.yml 门禁步骤的注释，「保持上一次成功发布的版本」出自 deploy job 的
 *  `needs: lighthouse`——门禁红，发布 job 根本不跑，Pages 上还是上次的产物。
 *  用例⑧直接读这两个文件对账，配置改口而措辞没跟上就会红。 */
export const HISTORY_GATE_NOTE =
  "Lighthouse 门禁（LCP < 2500ms · CLS < 0.1 · 无障碍得分 ≥ 0.95）不达标即判失败，不带病上线；任一步失败时线上保持上一次成功发布的版本。";

export type HistoryViewState =
  | { kind: "loading"; text: string }
  | { kind: "error"; bar: ErrorBar }
  | { kind: "empty" }
  | { kind: "list"; rows: HistoryRowView[]; caption: string };

/** 四支分流只此一处（§1 红线 1）。res === null 是「还没回」＝loading；
 *  ok 且 runs 为空数组才是「回来了、确实没有」＝empty。两者并成一支，就把「读不到」渲成了
 *  「上游还没跑过」——runs.ts 顶部立那一层要挡的正是它，分流也必须留在同一层。 */
export function historyView(res: RunsResult | null): HistoryViewState {
  if (res === null) return { kind: "loading", text: HISTORY_LOADING_TEXT };
  if (res.kind === "error") return { kind: "error", bar: errorBar("history", res.message, res.status, res.hint) };
  const rows = res.runs.map(historyRow);
  if (!rows.length) return { kind: "empty" };
  return { kind: "list", rows, caption: historyCaption(rows.length) };
}

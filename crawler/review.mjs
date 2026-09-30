/** 「盖章」语义的唯一实现（§1 红线 5）：Issue 指令 → applyDecisions → 产出四件套 → 回执 / 关单。
 *  两个调用方共用这一份，且只有这一份：
 *    · scripts/review-apply.mjs —— CI 的 review job，把 res.files 落盘后由 job 的 git 步骤提交；
 *    · src/lib/admin/publish.ts —— /admin 后台，把 res.files 逐文件走 Contents API 提交。
 *  为什么从 scripts/ 搬进来：本文件原先所在之处 import node:fs，浏览器一引就炸构建；搬进来后
 *  本文件零 fs、零 env、零时钟，一切经参数注入（与 crawler/approve.mjs 同口径）。
 *  函数体自 scripts/review-apply.mjs 逐字搬入，未改行为——`tests/review-apply.test.ts` 的既有 7 例
 *  一字不改仍然要绿，这就是「等价」的机器证明。 */
import { keyOf } from "./diff.mjs";
import { allowlistCheck, denyNote } from "./allowlist.mjs";
import { applyDecisions } from "./approve.mjs";
import { closeIssue, commentIssue } from "./github.mjs";
import { dump } from "./serialize.mjs";

/** 指令行的分词（§3 决策 16 C-1）：默认按空白 / 半角逗号 / 全角逗号切，但**双引号段整体成一个 token**，
 *  引号内的 `\` 与 `"` 按反斜杠转义还原。为什么必须有引号形态：id 是 `${kind}:${name}`，`name` 直接来自
 *  卡片名/观望项名，而现库 59 个 id 里 33 个含空白——没有约定时 `commandText` 拼出的指令会被旧的
 *  `split(/[\s,，]+/)` 切成碎片，碎片 id 在 pending 里必然未命中 ⇒ 审批静默空转、却仍回「已发布」。
 *  未加引号的输入与 `split(/[\s,，]+/)` 逐字同结果（人手写的旧格式不受影响）。两个分支各吃 ≥1 字符，
 *  不存在零宽匹配，故 `lastIndex` 必推进、循环必终止。 */
function splitTokens(raw) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^\s,，]+)/g;
  for (let m = re.exec(raw); m !== null; m = re.exec(raw)) {
    out.push(m[1] === undefined ? m[2] : m[1].replace(/\\(["\\])/g, "$1"));
  }
  return out;
}

/** 每行一条：/approve card:WorkBuddy 或 /approve all；分隔符吃半角/全角逗号与空格；
 *  id 里含空白或逗号时必须整体用双引号括起（`commandText` 就是这么生成的，两者互逆）。 */
export function parseCommands(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*\/(approve|reject)\s+(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const action = m[1].toLowerCase();
    for (const tok of splitTokens(m[2])) out.push({ action, id: tok });
  }
  return out;
}

/** CLI 收尾措辞（整枝终审 #2）：`changed:false` 有两种成因，日志必须区分——
 *  「评论里压根没指令」（空跑）与「有指令但一条都没合入」（id 未命中或已全部处理完）。
 *  两者都零写盘，但后者提示的是「评论送进来了、只是没生效」，混印会误导运维排查方向。 */
export function noChangeNote(comment) {
  return parseCommands(comment).length
    ? "评论含指令但无可合入项（id 未命中或已全部处理），跳过"
    : "评论不含指令，跳过";
}

/** id 里出现切分符就得加引号——与 `splitTokens` 是互逆的一对（§1 红线 5 的另一半：解析只有一处，
 *  生成也只有一处）。判据只测这三个字符类：`\s` 与 `,`/`，` 是切分符，`"` 会提前终结引号段。 */
const needsQuote = (id) => /[\s,，"]/.test(id);
const quoteId = (id) => (needsQuote(id) ? `"${id.replace(/([\\"])/g, "\\$1")}"` : id);

/** decisions → 评论正文：与 parseCommands 互逆的一对（§1 红线 5 的另一半——解析只有一处，生成也只能有一处）。
 *  同类动作并成一行：Issue 时间线上「一条指令 = 一次可审计的盖章」，逐条一行会把一次操作摊成 N 条评论。 */
export function commandText(decisions) {
  const groups = new Map();
  for (const { action, id } of decisions || []) {
    if (!groups.has(action)) groups.set(action, []);
    groups.get(action).push(quoteId(id));
  }
  return [...groups].map(([action, ids]) => `/${action} ${ids.join(" ")}`).join("\n");
}

/** 裁决 ①（workflow 侧）：评论者 → 三种结论。为什么不是简单的 true/false——
 *  「bot 回声」与「人类越权」的处置动作完全相反：前者必须**静默**（回执会自触发，见计划 3 Task 6 的三重防线表
 *  三重防线表），后者必须**公开留痕**（有人试着盖章，就得让他在 Issue 时间线上被拒一次）。
 *  名单本体走 `allowlistCheck` 单一实现（`config/site-config.json` 的 `adminLogins` 由调用方读盘传入，
 *  见 §3 决策 4）；措辞走 `denyNote`，此处不再写第二句。 */
export function reviewGate({ commenter, config } = {}) {
  const login = String(commenter || "").trim();
  if (/\[bot\]$/i.test(login)) return { verdict: "skip", login, note: "" };
  const gate = allowlistCheck({ login, logins: (config && config.adminLogins) || [] });
  return { verdict: gate.ok ? "ok" : "denied", login, note: gate.ok ? "" : denyNote(gate) };
}

/**
 * JSDoc 仅为通过 tsc 的类型闸（.mjs 本体不开 checkJs，运行时零改动）：
 * fetchImpl 是测试接缝，注入的桩不实现完整 Response，故放宽为 (url, init) => Promise<any>。
 * @param {{repo: string, issueNumber: number, pending: any, data: any, comment: string, token?: string, fetchImpl?: (url: any, init: any) => Promise<any>, commit?: (files: Record<string, string>) => Promise<unknown>}} params
 * @returns {Promise<{changed: boolean, applied: any[], missing: string[], files: Record<string, string>, pendingLeft: number}>}
 */
export async function runReview({ repo, issueNumber, pending, data, comment, token = "", fetchImpl = globalThis.fetch, commit }) {
  const cmds = parseCommands(comment);
  if (!cmds.length) return { changed: false, applied: [], missing: [], files: {}, pendingLeft: pending?.changes?.length || 0 };

  /* 终审 (D)：id 格式串只允许有一处实现（diff.mjs 的 keyOf），此处复用而非同形复刻 */
  const allIds = (pending?.changes || []).map(keyOf);
  const decisions = [];
  for (const c of cmds) {
    if (c.id.toLowerCase() === "all") decisions.push(...allIds.map((id) => ({ action: c.action, id })));
    else decisions.push(c);
  }

  const res = applyDecisions({ pending: pending || { version: 1, changes: [] }, ...data }, decisions);
  const files = {
    "data/tokens.json": dump(res.data.cards),
    "data/donots.json": dump(res.data.donots),
    "data/rules.json": dump(res.data.rules),
    "pending/changes.json": dump(res.pending),
  };
  const lines = res.applied.map((a) => `- ${a.action === "approve" ? "✅ 通过" : "❌ 驳回"} \`${a.id}\``);
  if (res.missing.length) lines.push("", "未找到（可能已处理过）：", ...res.missing.map((id) => `- ⚠️ ${id}`));
  lines.push("", res.pending.changes.length ? `仍有 ${res.pending.changes.length} 条待审。` : "pending 已清空，本 Issue 关闭；数据由 workflow 提交后自动发布。");
  /* issueNumber 为 0＝当前没有开放的审核 Issue（openReviewIssue 返回 null）。后台不该因为
   * 「Issue 被人手工关了」就盖不了章：跳过回执与关单，写面照常。CI 路径不受影响——
   * 壳里的 env 校验缺 ISSUE_NUMBER 直接 exit 1，永远拿不到 0。 */
  if (issueNumber) {
    await commentIssue(repo, issueNumber, lines.join("\n"), { token, fetchImpl });
    if (!res.pending.changes.length) await closeIssue(repo, issueNumber, { token, fetchImpl });
  }
  /* commit 钩子（本任务为 /admin 加的唯一写面扩展）三条纪律：
   *  1) 放在回执与关单**之后**：今天 CLI 的时序就是「Issue 先有回执、数据后由 job 提交」，
   *     搬进钩子不能顺手把它倒过来变成「先上线再宣布」。
   *  2) 只在 applied 非空时调用：与 main() 的 `if (!res.changed) return` 同一口径，
   *     「一条都没合入」绝不产生任何写。
   *  3) 钩子内部失败由调用方（publishApprovals）自己收着：本层不 try/catch，
   *     让 CLI 路径继续保留「写盘失败 = job 红」的老行为。 */
  if (commit && res.applied.length) await commit(files);
  return { changed: res.applied.length > 0, applied: res.applied, missing: res.missing, files, pendingLeft: res.pending.changes.length };
}

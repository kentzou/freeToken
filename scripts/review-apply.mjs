/** Issue 评论 /approve //reject 的 workflow 入口（crawl.yml review job）。
 *  runReview 全注入可测；CLI 只把 env/fs 接上——与计划 3 /admin 走同一 approve.mjs 语义。 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { dump } from "../crawler/serialize.mjs";
import { keyOf } from "../crawler/diff.mjs";
import { applyDecisions } from "../crawler/approve.mjs";
import { closeIssue, commentIssue } from "../crawler/github.mjs";

/** 每行一条：/approve card:WorkBuddy 或 /approve all；分隔符吃半角/全角逗号与空格 */
export function parseCommands(text) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*\/(approve|reject)\s+(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const action = m[1].toLowerCase();
    for (const tok of m[2].split(/[\s,，]+/)) if (tok) out.push({ action, id: tok });
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

/**
 * JSDoc 仅为通过 tsc 的类型闸（.mjs 本体不开 checkJs，运行时零改动）：
 * fetchImpl 是测试接缝，注入的桩不实现完整 Response，故放宽为 (url, init) => Promise<any>。
 * @param {{repo: string, issueNumber: number, pending: any, data: any, comment: string, token?: string, fetchImpl?: (url: any, init: any) => Promise<any>}} params
 * @returns {Promise<{changed: boolean, applied: any[], missing: string[], files: Record<string, string>, pendingLeft: number}>}
 */
export async function runReview({ repo, issueNumber, pending, data, comment, token = "", fetchImpl = globalThis.fetch }) {
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
  await commentIssue(repo, issueNumber, lines.join("\n"), { token, fetchImpl });
  if (!res.pending.changes.length) await closeIssue(repo, issueNumber, { token, fetchImpl });
  return { changed: res.applied.length > 0, applied: res.applied, missing: res.missing, files, pendingLeft: res.pending.changes.length };
}

async function main() {
  const root = process.cwd();
  const read = (rel, fallback = null) =>
    existsSync(path.resolve(root, rel)) ? JSON.parse(readFileSync(path.resolve(root, rel), "utf8")) : fallback;
  const comment = process.env.COMMENT_BODY || "";
  const issueNumber = Number(process.env.ISSUE_NUMBER || 0);
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY || !issueNumber || !comment) {
    console.error("review-apply 缺少 env：GITHUB_TOKEN/GITHUB_REPOSITORY/ISSUE_NUMBER/COMMENT_BODY");
    process.exit(1);
  }
  const res = await runReview({
    repo: process.env.GITHUB_REPOSITORY,
    issueNumber,
    token: process.env.GITHUB_TOKEN,
    comment,
    pending: read("pending/changes.json", { version: 1, changes: [] }),
    data: {
      cards: read("data/tokens.json"),
      donots: read("data/donots.json"),
      rules: read("data/rules.json"),
    },
  });
  if (!res.changed) {
    console.log(noChangeNote(comment));
    return;
  }
  for (const [rel, text] of Object.entries(res.files)) {
    const abs = path.resolve(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  console.log(`review 合入：处理 ${res.applied.length} 条 · 未识别 ${res.missing.length} 条 · 剩余待审 ${res.pendingLeft}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `data-changed=true\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

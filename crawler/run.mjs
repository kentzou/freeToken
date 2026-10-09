/** 爬取发布管线编排（spec §7）。三层：syncOnce 纯函数（比对+两队列分流）、
 *  crawlOnce 编排（注入 fetch/fs 文本，可全测）、底部 CLI（真 fs/env 接线）。
 *  workflow YAML 零逻辑——线上与本地跑的是同一份代码。 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSeed } from "../scripts/export-seed.mjs";
import { loadLocalCards } from "../crawler/local-cards.mjs";
import { dump } from "./serialize.mjs";
import { FIELD_LIMIT, diffAll, isRemoval, keyOf, kindLabel } from "./diff.mjs";
import { validateCards, validateRulesJson } from "./validate.mjs";
import { UPSTREAM_REPO, createIssue, fetchRawText, headStatus, latestCommitSha } from "./github.mjs";

/** 上游已从 app.js（源码里嵌结构体）迁到纯数据 data.json；旧地址 404 且不再含任何可提取结构 */
export const UPSTREAM_RAW = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/main/data.json`;

/** 两队列分流：新增即发布；修改/删除持旧值待审（spec §7.6 互不阻塞） */
export function syncOnce({ prev, next, existingPending, upstreamSha, detectedAt }) {
  const diff = diffAll(prev, next);

  const holdCards = new Map();
  for (const e of diff.changed) if (e.kind === "card") holdCards.set(e.name, e.before);
  for (const e of diff.removed) if (e.kind === "card") holdCards.set(e.name, e.before);
  const cards = next.cards.map((c) => holdCards.get(c.name) ?? c);
  for (const e of diff.removed) if (e.kind === "card") cards.push(e.before);

  const holdW = new Map();
  for (const e of diff.changed) if (e.kind === "watch") holdW.set(e.name, e.before);
  for (const e of diff.removed) if (e.kind === "watch") holdW.set(e.name, e.before);
  const donots = next.donots.map((w) => holdW.get(w.name) ?? w);
  for (const e of diff.removed) if (e.kind === "watch") donots.push(e.before);

  const rulesEntries = diff.changed.filter((e) => e.kind === "rules");
  const rules = rulesEntries.length ? prev.rules : next.rules; // 任一规则表变动 → 整表持旧待审

  const pending = mergePending({
    existing: existingPending,
    detected: [...diff.changed, ...diff.removed],
    upstreamSha,
    detectedAt,
  });
  return { diff, data: { cards, donots, rules }, pending };
}

/** pending 累积：同 kind:name 取最新检测，未重新检测到的旧未决条目保留 */
export function mergePending({ existing, detected, upstreamSha, detectedAt }) {
  const map = new Map();
  for (const e of existing?.changes || []) map.set(keyOf(e), e);
  for (const e of detected) map.set(keyOf(e), e);
  return { version: 1, upstreamSha, detectedAt, changes: [...map.values()] };
}

const short = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > 120 ? s.slice(0, 117) + "…" : s;
};

export function reviewIssueTitle(pending) {
  const m = pending.changes.filter((e) => !isRemoval(e)).length;
  const d = pending.changes.filter(isRemoval).length;
  return `审核：上游变更待核验（修改 ${m} / 删除 ${d}）`;
}

/** Issue 正文 = 审核队列唯一人类可读形态（/admin 页面同源渲染这份数据，禁止另拼一套） */
export function reviewIssueBody(pending) {
  const lines = [
    `上游 commit：\`${pending.upstreamSha}\` · 检测时间：${pending.detectedAt}`,
    "",
    "修改/删除不自动入库（决策 #7）；data/*.json 在盖章前保持旧值。",
    "",
  ];
  pending.changes.forEach((e, i) => {
    const kindCn = kindLabel(e.kind);
    lines.push(`## ${i + 1}. [${kindCn}] ${e.name} — \`${keyOf(e)}\``);
    for (const f of e.fields.slice(0, FIELD_LIMIT)) lines.push(`- \`${f.field}\`：\`${short(f.from)}\` → \`${short(f.to)}\``);
    if (e.fields.length > FIELD_LIMIT) lines.push(`- …共 ${e.fields.length} 个字段差异`);
    lines.push("");
  });
  lines.push("回复 `/approve <id>` 或 `/reject <id>`（每行一条，id 见标题行内反引号）；`/approve all` 全部通过。也可在 /admin 一键盖章。");
  return lines.join("\n");
}

/** 通知 Issue 标题：纯函数，只列新增数（改删走审核 Issue，互不混排）。
 *  @param {{ added: object[], sha?: string }} summary —— sha 供调用方上下文，标题不消费。 */
export function notifyIssueTitle({ added }) {
  return `自动同步：新增 ${added.length} 条情报已上线`;
}

export function notifyIssueBody({ added, sha }) {
  return [
    `上游 commit \`${sha}\` 新增 ${added.length} 条，已按三层清洗自动发布（零引流参数，逐条通过 linkRisk 终审）：`,
    "",
    ...added.map((e) => `- **${e.name}**（${e.after?.type || "?"}）：${short(e.after?.quota || e.after?.why || "")}`),
    "",
    "如有不实，直接开新 Issue 或在本 Issue 回复 `/reject <卡名>`——下一周期将转人工审核并修正。",
  ].join("\n");
}

/** 编排核心：全部副作用注入。deps 字段即测试接缝清单。
 *  @returns {Promise<{unchanged: boolean, sha: string, added: string[], changedIds: string[],
 *    removedIds: string[], rulesChanged: number, warn: string[], pendingTotal: number,
 *    pendingEntries: object[], files: Record<string, string>,
 *    issues: {review?: {number: number, url: string}, notify?: {number: number, url: string}}}>}
 *    —— files/issues 必须钉成 Record 形：两处 return 的字面量联合会让 TS 拒绝对 `{}` 分支按键索引。 */
export async function crawlOnce(deps) {
  const {
    prev, meta, config,
    existingPending = null,
    token = "", repo = "",
    latestSha = null, sourceText = null,
    fetchImpl = globalThis.fetch,
    sleep,
    now = new Date().toISOString(),
    checkLinks = false,
  } = deps;

  const sha = latestSha ?? (await latestCommitSha(UPSTREAM_REPO, { token, fetchImpl, sleep }));
  if (meta.lastSyncedSha && meta.lastSyncedSha === sha) {
    return { unchanged: true, sha, added: [], changedIds: [], removedIds: [], rulesChanged: 0, warn: [], pendingTotal: 0, pendingEntries: [], files: {}, issues: {} };
  }

  const src = sourceText ?? (await fetchRawText(UPSTREAM_RAW, { token, fetchImpl, sleep }));
  /* Q1：prev 既是比对基线，也是观点字段基底——上游只刷事实，本地手写内容随上一轮产物继承 */
  const seed = buildSeed(src, config, prev);
  validateRulesJson(seed.rules); // 写入侧校验：不合法规则/脏链接一律在动笔前抛
  validateCards(seed.cards);

  const { diff, data, pending } = syncOnce({
    prev,
    next: { cards: seed.cards, donots: seed.donots, rules: seed.rules },
    existingPending,
    upstreamSha: sha,
    detectedAt: now,
  });
  validateCards(data.cards);

  const warn = [];
  if (checkLinks) {
    for (const e of diff.added) {
      const url = e.after?.link;
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const st = await headStatus(url, { fetchImpl });
      if (st !== 200 && st !== 301 && st !== 302) warn.push(`新增「${e.name}」HEAD=${st || "异常"}（仅标记，不阻止发布）`);
    }
  }

  const files = {
    "data/tokens.json": dump(data.cards),
    "data/donots.json": dump(data.donots),
    "data/rules.json": dump(data.rules),
    "data/meta.json": dump({
      lastSyncedSha: sha,
      lastSyncedAt: now,
      sourceFingerprint: createHash("sha256").update(src).digest("hex").slice(0, 16),
      counts: { tokens: data.cards.length, donots: data.donots.length },
    }),
  };
  if (pending.changes.length) files["pending/changes.json"] = dump(pending);

  const issues = {};
  if (token && repo) {
    if (diff.added.length) {
      issues.notify = await createIssue(repo, {
        title: notifyIssueTitle({ added: diff.added }),
        body: notifyIssueBody({ added: diff.added, sha }),
        labels: ["auto"],
      }, { token, fetchImpl });
    }
    const sameAsExisting =
      existingPending &&
      JSON.stringify(existingPending.changes.map(keyOf).sort()) === JSON.stringify(pending.changes.map(keyOf).sort());
    if (pending.changes.length && !sameAsExisting) {
      issues.review = await createIssue(repo, {
        title: reviewIssueTitle(pending),
        body: reviewIssueBody(pending),
        labels: ["review"],
      }, { token, fetchImpl });
    }
  }

  return {
    unchanged: false,
    sha,
    added: diff.added.map((e) => e.name),
    changedIds: diff.changed.map(keyOf),
    removedIds: diff.removed.map(keyOf),
    rulesChanged: diff.changed.filter((e) => e.kind === "rules").length,
    warn,
    pendingTotal: pending.changes.length,
    pendingEntries: pending.changes,
    files,
    issues,
  };
}

const DATA_KEYS = ["data/tokens.json", "data/donots.json", "data/rules.json", "data/meta.json"];

async function main() {
  const root = process.cwd();
  const read = (rel) => JSON.parse(readFileSync(path.resolve(root, rel), "utf8"));
  // 本地增补表：与 export-seed:loadLocal 同口径（缺文件＝空表），两处各读一次不合并，
  // 因为爬虫侧的 root 与 seed 的 cwd 语义在这里一致，多一层共享工具反而把纯函数模块拖进 fs。
  const localCardsPath = path.resolve(root, "config", "local-cards.json");
  const meta = read("data/meta.json");
  const config = read("config/site-config.json");
  const existingPending = existsSync(path.resolve(root, "pending/changes.json")) ? read("pending/changes.json") : null;
  const token = process.env.GITHUB_TOKEN || "";
  const repo = process.env.GITHUB_REPOSITORY || "";

  let summary;
  try {
    // 本地表读盘必须在 try 内（评审 M-2）：JSON 坏 / 顶层非数组时 loadLocalCards 会抛，
    // 留在 try 外就绕过下面那句「crawl 中止：<原因>」的可读单行出口，只剩裸堆栈。
    const localCards = loadLocalCards(existsSync(localCardsPath) ? readFileSync(localCardsPath, "utf8") : "");
    summary = await crawlOnce({
      meta, config, token, repo, existingPending, checkLinks: true,
      prev: { cards: read("data/tokens.json"), donots: read("data/donots.json"), rules: read("data/rules.json"), localCards },
    });
  } catch (e) {
    // spec §7.3「解析失败停下」：非 0 退出 + 可读原因；Issue 通知交给 workflow 的失败后续（本地只报错）
    console.error(`crawl 中止：${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (summary.unchanged) {
    console.log(`无变化：上游仍是 ${summary.sha.slice(0, 10)}，不发布`);
  } else {
    for (const [rel, text] of Object.entries(summary.files)) {
      const abs = path.resolve(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    console.log(
      `crawl 完成：新增 ${summary.added.length} · 修改 ${summary.changedIds.length} · 删除 ${summary.removedIds.length}` +
        ` · 规则 ${summary.rulesChanged} · pending ${summary.pendingTotal} · sha ${summary.sha.slice(0, 10)}` +
        ` · 数据${Object.keys(summary.files).some((f) => !DATA_KEYS.includes(f)) ? "含 pending" : "仅入库文件"}`
    );
    if (summary.warn.length) console.warn(`warn（不阻塞）：\n  ${summary.warn.join("\n  ")}`);
    if (summary.issues.notify) console.log(`通知 Issue：${summary.issues.notify.url}`);
    if (summary.issues.review) console.log(`审核 Issue：${summary.issues.review.url}`);
    if (!token) console.warn("无 GITHUB_TOKEN：跳过 Issue 创建与数据提交（本地模式，文件已写入）");
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `data-changed=${summary.unchanged ? "false" : "true"}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

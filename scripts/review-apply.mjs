/** Issue 评论 /approve //reject 的 workflow 入口（crawl.yml 的 review job）。
 *  审批语义本体在 crawler/review.mjs（全站唯一，与 /admin 后台共用）——本文件只剩三件事：
 *  接 env/fs、把 res.files 落盘、把 data-changed 写进 GITHUB_OUTPUT。
 *  Task 6 会在此处接上评论者白名单闸（裁决 ①）。 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { commentIssue } from "../crawler/github.mjs";
import { noChangeNote, reviewGate, runReview } from "../crawler/review.mjs";

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
  /* 裁决 ①：审批授权面治理。名单从**工作树**里的 config/site-config.json 读——本 job 的 checkout
   *  落在触发提交上，磁盘内容即权威值，不必再发一次 Contents 请求（§3 决策 4）。
   *  skip/denied 都在此处终止：runReview 一次也不会被调用，故不写任何数据、不关任何 Issue；
   *  后面的提交步骤因 `git diff --cached --quiet` 而打印「数据未变，跳过提交」。 */
  const gate = reviewGate({ commenter: process.env.TFN_COMMENTER || "", config: read("config/site-config.json", {}) });
  if (gate.verdict !== "ok") {
    if (gate.verdict === "denied")
      await commentIssue(process.env.GITHUB_REPOSITORY, issueNumber, `⛔ 无权限：${gate.note}`, { token: process.env.GITHUB_TOKEN });
    console.log(gate.verdict === "skip" ? `review 跳过：${gate.login} 是 bot 回声，未合入任何数据` : `review 拒绝：${gate.login || "(无 login)"} 不在白名单，已回执未合入任何数据`);
    return;
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

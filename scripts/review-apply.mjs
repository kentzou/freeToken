/** Issue 评论 /approve //reject 的 workflow 入口（crawl.yml 的 review job）。
 *  审批语义本体在 crawler/review.mjs（全站唯一，与 /admin 后台共用）——本文件只剩三件事：
 *  接 env/fs、把 res.files 落盘、把 data-changed 写进 GITHUB_OUTPUT。
 *  Task 6 会在此处接上评论者白名单闸（裁决 ①）。 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { noChangeNote, runReview } from "../crawler/review.mjs";

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

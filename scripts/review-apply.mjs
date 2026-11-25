/** Issue 评论 /approve //reject 的 workflow 入口（crawl.yml 的 review job）。
 *  审批语义本体在 crawler/review.mjs（全站唯一，与 /admin 后台共用）——本文件只剩三件事：
 *  接 env/fs、把 res.files 落盘、把 data-changed 写进 GITHUB_OUTPUT。
 *  评论者白名单闸（裁决 ①）已接在下方 env 校验之后：非白名单只回执即退出，连数据都不读进进程。 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { commentIssue } from "../crawler/github.mjs";
import { noChangeNote, reviewGate, runReview } from "../crawler/review.mjs";
import { dump } from "../crawler/serialize.mjs";

/** meta.counts 派生回写（纯函数）：条数与产物不一致才产出新文本，一致则返回 null（幂等）。
 *  为什么单独抽出来：CLI 壳要落盘的是「文本」，而这段判定值得被单测钉住——
 *  写错一个键名就会让下一次 deploy 的 meta 闸变红，且只在「有人真的盖章下架」时才复发。 */
export function withMetaCounts(metaText, tokensText, donotsText) {
  const meta = JSON.parse(metaText);
  const counts = {
    tokens: JSON.parse(tokensText).length,
    donots: JSON.parse(donotsText).length,
  };
  if (meta.counts && meta.counts.tokens === counts.tokens && meta.counts.donots === counts.donots) return null;
  meta.counts = counts; // 既有键序不动：只在原位改这两个数，dump() 与管线同一份字节口径
  return dump(meta);
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
  /* 裁决 ①：审批授权面治理。名单从**工作树**里的 config/site-config.json 读——本 job 的 checkout
   *  落在触发提交上，磁盘内容即权威值，不必再发一次 Contents 请求（§3 决策 4）。
   *  skip/denied 都在此处终止：runReview 一次也不会被调用，故不写任何数据、不关任何 Issue；
   *  后面的提交步骤因 `git diff --cached --quiet` 而打印「数据未变，跳过提交」。 */
  const gate = reviewGate({ commenter: process.env.TFN_COMMENTER || "", config: read("config/site-config.json", {}) });
  if (gate.verdict !== "ok") {
    if (gate.verdict === "denied")
      await commentIssue(process.env.GITHUB_REPOSITORY, issueNumber, `⛔ 无权限：${gate.note}`, { token: process.env.GITHUB_TOKEN });
    console.log(gate.verdict === "skip" ? `review 跳过：${gate.login} 是 bot 回声，未合入任何数据` : `review 拒绝：${gate.login || "(无 login)"} —— ${gate.note}（未合入任何数据）`);
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
  /* meta.counts 回写：runReview 产出只有四件套，meta 不在其中——而 counts 是 crawl 落盘时按当时
   *  条数写死的。盖章若整条下架（或新增），不回写 counts 就会让下一次 deploy 的 quality 闸
   *  （tests/seed.test.ts「meta 含条数」）变红：数据没错、闸没错，只是没人同步这个派生字段。
   *  只动 counts 两个数：lastSyncedSha / sourceFingerprint / localFingerprint 是同步事实（红线③），
   *  一律不碰。序列化走 dump()，与管线/后台同一份字节口径。 */
  const metaPath = path.resolve(root, "data/meta.json");
  if (existsSync(metaPath)) {
    const nextMeta = withMetaCounts(
      readFileSync(metaPath, "utf8"),
      res.files["data/tokens.json"],
      res.files["data/donots.json"]
    );
    if (nextMeta !== null) {
      writeFileSync(metaPath, nextMeta);
      const { counts } = JSON.parse(nextMeta);
      console.log(`meta.counts 回写：${counts.tokens} 张卡 / ${counts.donots} 条观望`);
    }
  }
  console.log(`review 合入：处理 ${res.applied.length} 条 · 未识别 ${res.missing.length} 条 · 剩余待审 ${res.pendingLeft}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `data-changed=true\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

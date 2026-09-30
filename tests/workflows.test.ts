import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const crawl = load(readFileSync(".github/workflows/crawl.yml", "utf8")) as Record<string, any>;
const deploy = load(readFileSync(".github/workflows/deploy.yml", "utf8")) as Record<string, any>;
const lhrc = JSON.parse(readFileSync(".lighthouserc.json", "utf8"));

describe("workflow 结构红线（真实执行列入线上步骤，这里锁死形态）", () => {
  it("crawl.yml：6 小时 cron + dispatch + issue_comment 三入口；数据 commit 只在真变更时发生", () => {
    expect(crawl.on.schedule).toEqual([{ cron: "0 */6 * * *" }]);
    expect(Object.keys(crawl.on)).toEqual(["schedule", "workflow_dispatch", "issue_comment"]);
    expect(crawl.jobs.crawl.if).toContain("issue_comment");
    const crawlSteps = crawl.jobs.crawl.steps.map((s: { run?: string }) => s.run || "").join("\n");
    expect(crawlSteps).toContain("npm run crawl");
    expect(crawlSteps).toContain("git diff --cached --quiet"); // 无实质变更不产生空提交
    /* 终审遗留 (C)：命令前缀判定权归 parseCommands（/i + 容忍前导空白 + 逐行解析）。
       workflow 里再写 startsWith('/approve') 就成了「门比锁严」：/APPROVE、" /approve"、
       「说明文字 + 换行 + 指令」全部不会被触发。触发面只按 label，命令面只按解析器。 */
    expect(crawl.jobs.review.if).toContain("issue_comment");
    expect(crawl.jobs.review.if).toContain("contains(github.event.issue.labels.*.name, 'review')");
    expect(crawl.jobs.review.if).not.toContain("startsWith");
    expect(crawl.jobs.review.if).not.toContain("/approve");
    /* 整枝终审（M2 升为 Important）：(C) 放宽后触发面只剩 label，而 issue_comment 事件对 Issue 与
       PR 评论一视同仁——带 `review` 标签的 PR 下任何评论也会起 job，且那时 checkout 取的是 PR 合并态
       的 pending/changes.json，等于把「谁能改线上数据」的授权面从审核 Issue 扩到任意被打标 PR。
       旧 yml 的 startsWith('/approve') 前缀判定是一道偶然防线，放宽后必须显式补 PR 排除。 */
    expect(crawl.jobs.review.if).toContain("github.event.issue.pull_request == null");
    /* 评审 C1：触发面放宽后「无指令→空跑退 0」是新承诺，而 fresh checkout 里 pending/ 既未跟踪
       也不存在（review-apply 早退时不写盘、run.mjs 只在有待审条目时才写），`git add data pending`
       会 pathspec 128 把整个 job 染红。两个 job 的提交步骤都得钉住「data 恒加、pending 有才加」。 */
    const reviewSteps = crawl.jobs.review.steps.map((s: { run?: string }) => s.run || "").join("\n");
    /* 反向断言只查「会被执行的那行」：yml 注释里刻意引用了旧命令原文作说明，
       不剔注释行会把自己写的注释判成回归。 */
    const cmds = (steps: string) => steps.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(crawlSteps).toContain("if [ -d pending ]; then git add pending; fi");
    expect(reviewSteps).toContain("if [ -d pending ]; then git add pending; fi");
    expect(cmds(crawlSteps)).not.toContain("git add data pending");
    expect(cmds(reviewSteps)).not.toContain("git add data pending");
    expect(crawl.permissions).toMatchObject({ "contents": "write", "issues": "write" });
  });

  it("deploy.yml：quality → lighthouse → deploy 三级链；红线测试与 Lighthouse 门禁都在部署前", () => {
    expect(deploy.jobs.lighthouse.needs).toBe("quality");
    expect(deploy.jobs.deploy.needs).toBe("lighthouse");
    const q = deploy.jobs.quality.steps.map((s: { run?: string }) => s.run || "").join("\n");
    expect(q).toContain("npm run test\n");
    expect(q).toContain("npm run seed:repro");
    expect(q).toContain("npm run test:out"); // 终审 #6：产物红线接 CI
    const names = deploy.jobs.lighthouse.steps.map((s: { name?: string; uses?: string }) => s.name || s.uses || "");
    expect(names.join("\n")).toContain("Lighthouse 门禁");
    expect(deploy.jobs.lighthouse.steps.some((s: { uses?: string }) => (s.uses || "").startsWith("treosh/lighthouse-ci-action@"))).toBe(true);
    expect(deploy.jobs.deploy.steps.some((s: { uses?: string }) => (s.uses || "").startsWith("actions/deploy-pages@"))).toBe(true);
  });

  it("review job 的评论者闸门（裁决 ①）：if 加 bot 排除，login 进 env，名单判定不在 yml 里", () => {
    const review = crawl.jobs.review;
    /* 四个合取项必须在同一条表达式里（终审 C1 的教训：`if:` 被写成重复键时整道 job 门形同不存在）。
       失效形态实测（§3 决策 17 M-3）：重复 `if:` 键下 js-yaml 直接抛 `duplicated mapping key`（行列号随
       插入点变化，不写死），整份 workflows.test.ts 变红——失败是**响亮**的，不是「静默丢后一段」，
       排查时别按被悄悄忽略的模型找。 */
    expect(review.if).toContain("github.event_name == 'issue_comment'");
    expect(review.if).toContain("github.event.issue.pull_request == null");
    expect(review.if).toContain("contains(github.event.issue.labels.*.name, 'review')");
    expect(review.if).toContain("!endsWith(github.event.comment.user.login, '[bot]')");
    /* 名单本体不许写进 yml：adminLogins 的唯一比对处是 crawler/allowlist.mjs（红线 1），
       这里只钉「login 传到了 CLI」。 */
    expect(review.if).not.toContain("adminLogins");
    /* §3 决策 17 I-1：只钉 `if` 会漏「名单塞进步骤 env」——变异实测（把 `TFN_ADMIN_LOGINS: ${{ toJSON(vars.adminLogins) }}`
       塞进 env）现有全部断言仍绿。steps 级补一条即可抓到（基线实测为 PASS，不会假红：js-yaml 丢注释，
       所以 yml 注释里那处 `adminLogins` 文字引用不在此扫描面内，与本钉不冲突）。 */
    expect(JSON.stringify(review.steps)).not.toContain("adminLogins");
    const gate = review.steps.find((s: { run?: string }) => (s.run || "").includes("node scripts/review-apply.mjs"));
    expect(gate.env.TFN_COMMENTER).toBe("${{ github.event.comment.user.login }}");
    expect(gate.env.ISSUE_NUMBER).toBe("${{ github.event.issue.number }}");
    /* 反向：闸门失效也不能靠 yml 兜住数据写入——提交步骤仍只在真有变更时提交 */
    const steps = review.steps.map((s: { run?: string }) => s.run || "").join("\n");
    expect(steps).toContain("git diff --cached --quiet");
  });

  it(".lighthouserc.json：三项门槛值 = spec §9 承诺值（LCP 2500ms / CLS 0.1 / A11y 0.95），URL 打本地根路径", () => {
    expect(lhrc.ci.assert.assertions["largest-contentful-paint"]).toEqual(["error", { median: 2500 }]);
    expect(lhrc.ci.assert.assertions["cumulative-layout-shift"]).toEqual(["error", { median: 0.1 }]);
    expect(lhrc.ci.assert.assertions["categories:accessibility"]).toEqual(["error", { minScore: 0.95 }]);
    expect(lhrc.ci.collect.url).toEqual(["http://127.0.0.1:3000/", "http://127.0.0.1:3000/intel/workbuddy/"]);
  });
});

describe("quality job 的 lint 闸（Task 7 基座钉）", () => {
  it("deploy.yml 执行 npm run lint，且 lint 脚本带 --max-warnings=0", () => {
    const lintSteps = deploy.jobs.quality.steps.map((s: { run?: string }) => s.run || "").join("\n");
    expect(lintSteps).toContain("npm run lint");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toContain("--max-warnings=0");
  });
});

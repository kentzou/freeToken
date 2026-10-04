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
    /* LCP/CLS 用 maxNumericValue 钉数值门槛（LCP 2500ms / CLS 0.1，= spec §9 承诺）；
       minScore:0 是为了压掉 LHCI 对未显式给出断言类型的指标自动补的 minScore 0.9 默认断言——
       首轮 CI 实测它会把 LCP 1874ms（本已 < 2500ms）按分数 0.67 误杀。 */
    expect(lhrc.ci.assert.assertions["largest-contentful-paint"]).toEqual(["error", { maxNumericValue: 2500, minScore: 0 }]);
    expect(lhrc.ci.assert.assertions["cumulative-layout-shift"]).toEqual(["error", { maxNumericValue: 0.1, minScore: 0 }]);
    expect(lhrc.ci.assert.assertions["categories:accessibility"]).toEqual(["error", { minScore: 0.95 }]);
    expect(lhrc.ci.collect.url).toEqual(["http://127.0.0.1:3000/", "http://127.0.0.1:3000/intel/workbuddy/"]);
  });
});

describe("quality job 的 lint 闸（Task 7 基座钉）", () => {
  it("deploy.yml 执行 npm run lint，且 lint 脚本带 --max-warnings=0", () => {
    /* 逐步 trim 后精确等值：整串 toContain("npm run lint") 会被 `npm run lint:fix` 这类
       改写误绿——钉的是「跑的是这条会因 warning 变红的命令」，不是「有这么个前缀」。 */
    const lintRuns = deploy.jobs.quality.steps.map((s: { run?: string }) => (s.run || "").trim()).filter(Boolean);
    expect(lintRuns).toContain("npm run lint");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toContain("--max-warnings=0");
  });
});

/* —— 「抓到的数据必须真的上线」这条链的红线（2026-10-04 修）——
   病根：crawl 用 secrets.GITHUB_TOKEN 推 main，而 GitHub 防循环规则下由 GITHUB_TOKEN 触发的
   push 事件不创建新的 workflow run（例外只有 workflow_dispatch 与 repository_dispatch）；
   deploy.yml 靠 on: push + paths: data/** 触发，于是抓到的新卡永远躺在仓库里不上站。
   实证：bot 提交 156a82d 真实改了 data/tokens.json（直接命中 paths），deploy 全部 7 次 run 的
   head_sha 却无一例外是人工提交。修法是 push 之后显式 dispatch，故下面把这条链逐环节钉死。 */
describe("crawl → deploy 的上线链（GITHUB_TOKEN 防循环的绕行口）", () => {
  const crawlSteps = runs(crawl.jobs.crawl);
  /* 一律走 cmds()（剔注释行）：crawl.yml 的注释里我写了「--fail-with-body：dispatch 失败必须让
     本步变红」这类说明文字，不剔注释的话「把真命令删掉、只留注释」照样绿——本文件顶部那条围栏
     说的就是这件事。 */
  const shell = cmds(crawlSteps);

  it("actions: write 是 dispatch 的命门：缺它 dispatch 403，数据静默不上线", () => {
    /* 上面那条 toMatchObject 是**部分匹配**，删掉 actions 这一行它照样全绿——所以必须单独钉。
       这条权限是本轮修复唯一的前置开关，漏了不会有人发现，只表现为「站点数据不动了」。 */
    expect(crawl.permissions.actions).toBe("write");
  });

  it("push 之后显式 dispatch deploy.yml，带对 ref、且失败必须变红", () => {
    expect(shell).toContain("actions/workflows/deploy.yml/dispatches");
    /* ref 钉死 main：写成别的分支就会拿错误分支的内容去构建发布，而 dispatch 仍是 204 受理成功，
       症状同样是「站点内容不对」而非报错。 */
    expect(shell).toContain('{"ref":"main"}');
    /* 没有 --fail-with-body，dispatch 的 403 会被 curl 吞掉、step 照样绿——那就退回成
       「数据提交了、但没部署、且没人知道」，正是本轮要修的那个病。 */
    expect(shell).toContain("--fail-with-body");
  });

  it("push 失败即中止，不得继续 dispatch（否则部署一份没有新数据的产物）", () => {
    expect(shell).toContain("git push ||");
  });

  it("dispatch 排在「无实质数据变化」判定之后：无变化那条路走不到 dispatch", () => {
    /* 顺序钉（把 dispatch 挪到 git diff --cached --quiet 之前就会破）：无变化时产物不变，
       白跑一次 quality+lighthouse 约 3-4 分钟没有意义。这是防回归的第二道闸。 */
    expect(shell.indexOf("git diff --cached --quiet")).toBeLessThan(shell.indexOf("dispatches"));
  });

  it("deploy.yml 保留 workflow_dispatch 入口：它是 dispatch 的目标端点，删了会让上面的 dispatch 全部 404", () => {
    expect(Object.keys(deploy.on)).toContain("workflow_dispatch");
  });
});

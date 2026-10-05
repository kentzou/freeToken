import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const crawl = load(readFileSync(".github/workflows/crawl.yml", "utf8")) as Record<string, any>;
const deploy = load(readFileSync(".github/workflows/deploy.yml", "utf8")) as Record<string, any>;
const orCrawl = load(readFileSync(".github/workflows/crawl-openrouter.yml", "utf8")) as Record<string, any>;
const lhrc = JSON.parse(readFileSync(".lighthouserc.json", "utf8"));

/* 反向断言只查「会被执行的那行」：yml 注释里刻意引用了旧命令原文作说明（如 crawl.yml 的
   `git add data pending` 教训、本文件 openrouter 那条的「刻意不跑 npm ci」），
   不剔注释行会把自己写的注释判成回归。 */
const cmds = (steps: string) => steps.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const runs = (job: { steps: { run?: string }[] }) => job.steps.map((s) => s.run || "").join("\n");

describe("workflow 结构红线（真实执行列入线上步骤，这里锁死形态）", () => {
  it("crawl.yml：6 小时 cron + dispatch + issue_comment 三入口；数据 commit 只在真变更时发生", () => {
    expect(crawl.on.schedule).toEqual([{ cron: "23 */6 * * *" }]);
    expect(Object.keys(crawl.on)).toEqual(["schedule", "workflow_dispatch", "issue_comment"]);
    expect(crawl.jobs.crawl.if).toContain("issue_comment");
    const crawlSteps = runs(crawl.jobs.crawl);
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
    const reviewSteps = runs(crawl.jobs.review);
    expect(crawlSteps).toContain("if [ -d pending ]; then git add pending; fi");
    expect(reviewSteps).toContain("if [ -d pending ]; then git add pending; fi");
    expect(cmds(crawlSteps)).not.toContain("git add data pending");
    expect(cmds(reviewSteps)).not.toContain("git add data pending");
    expect(crawl.permissions).toMatchObject({ "contents": "write", "issues": "write" });
  });

  it("deploy.yml：quality → lighthouse → deploy 三级链；红线测试与 Lighthouse 门禁都在部署前", () => {
    expect(deploy.jobs.lighthouse.needs).toBe("quality");
    expect(deploy.jobs.deploy.needs).toBe("lighthouse");
    const q = runs(deploy.jobs.quality);
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
    expect(runs(review)).toContain("git diff --cached --quiet");
  });

  it("crawl-openrouter.yml：06:00 CST 换算成 UTC cron；零依赖不装包；只提交 data/openrouter.json 一份", () => {
    /* schedule 无 timezone 字段（Actions 不支持），06:00 Asia/Shanghai 必须写成前一日 22:00 UTC。
       toEqual 而非 toContain：多写一个 timezone 键（无效配置、给人「已经按时区跑了」的错觉）也会红。 */
    expect(orCrawl.on.schedule).toEqual([{ cron: "0 22 * * *" }]);
    expect(Object.keys(orCrawl.on)).toEqual(["schedule", "workflow_dispatch"]);
    /* 回写远端要写权限；不给 issues：这条不碰决策 #7 的两队列审核，不该有评论触发面。
       actions: write 是显式 dispatch deploy.yml 的命门（同 crawl.yml 修法），故一并钉入。 */
    expect(orCrawl.permissions).toEqual({ "contents": "write", "actions": "write" });
    const job = orCrawl.jobs.crawl;
    const all = runs(job);
    /* 抓取口径复用 package.json 的 crawl:or，与本机手工跑同一条命令——不允许 CI 与本地两套取数路径 */
    expect(all).toContain("npm run crawl:or");
    /* 刻意零依赖：openrouter.mjs 只用 node:crypto/node:fs/node:url + 内置 fetch，装包只会把 CI
       绑在 node_modules 上。断言剔注释，否则「刻意不跑 npm ci」那句注释会自己抓自己。 */
    expect(cmds(all)).not.toContain("npm ci");
    expect(cmds(all)).not.toContain("npm install");
    /* 提交面只有一份台账：把它接进 pending/tokens 的审核管道就是踩决策 #7 红线 */
    expect(cmds(all)).toContain("git add data/openrouter.json");
    expect(cmds(all)).not.toContain("git add pending");
    expect(cmds(all)).not.toMatch(/git add data(?!\/openrouter\.json)/);
    /* 抓取 fail-stop 时不产出文件，宁可台账停在前一天，也不能提交空/半成品；无实质变更不产生空提交 */
    expect(cmds(all)).toContain("if [ ! -f data/openrouter.json ]");
    expect(cmds(all)).toContain("git diff --cached --quiet");
    /* 回归钉：commit message 里的 run id 必须是 Actions 表达式 `${{ github.run_id }}`；
       写成 shell 的 ${github.run_id} 会被 bash 展开成空串——日志里那条提交看起来像没带 run 号，
       排查时无法反查是哪次调度。这里同时钉正例与错例形态。 */
    expect(cmds(all)).toContain("${{ github.run_id }}");
    expect(cmds(all)).not.toMatch(/\$\{github\./);
    /* API key 只作为可选增强传入（缺 key 时 accountQuota 整个缺席，不影响台账主体） */
    const keyStep = job.steps.find((s: { run?: string }) => (s.run || "").includes("npm run crawl:or"));
    expect(keyStep.env.OPENROUTER_API_KEY).toBe("${{ secrets.OPENROUTER_API_KEY }}");
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

  /* §7-19：/admin 发布的人类回执作者是非 bot login，会多起一次 review job。
     数据零风险（applied=[] → changed:false → CLI 早退），代价是 runner 与一条噪声评论。
     串行闸只消「两个 review 同时写 pending/」这一种竞态，不消噪声——噪声属设计内保守表述。
     js-yaml 会把 cancel-in-progress 解析成布尔 false，写成字符串 "false" 在这条用例里会红。 */
  it("crawl.yml：review job 串行闸 group=review-apply 且 cancel-in-progress=false（§7-19）", () => {
    expect(crawl.jobs.review.concurrency).toEqual({ group: "review-apply", "cancel-in-progress": false });
    expect(crawl.jobs.crawl.concurrency).toBeUndefined();
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

  /* —— crawl-openrouter.yml 的同一条上线链（台账也要真的上线，复刻上面 5 条红线；
       deploy.on 含 workflow_dispatch 与 crawl 共用一条，不重复钉） —— */
  const orShell = cmds(runs(orCrawl.jobs.crawl));

  it("or：actions: write 单独钉（上面的 toEqual 已钉入全量形态，这里是上线链视角的独立闸）", () => {
    expect(orCrawl.permissions.actions).toBe("write");
  });

  it("or：push 之后显式 dispatch deploy.yml，带对 ref、且失败必须变红", () => {
    expect(orShell).toContain("actions/workflows/deploy.yml/dispatches");
    expect(orShell).toContain('{"ref":"main"}');
    expect(orShell).toContain("--fail-with-body");
  });

  it("or：push 失败即中止，不得继续 dispatch（否则部署一份没有新台账的产物）", () => {
    expect(orShell).toContain("git push ||");
  });

  it("or：dispatch 排在「台账未变」判定之后：无变化那条路走不到 dispatch", () => {
    /* openrouter 的提交步里 git diff --cached --quiet 在 if 分支内，顺序断言（indexOf 比较）仍成立 */
    expect(orShell.indexOf("git diff --cached --quiet")).toBeLessThan(orShell.indexOf("dispatches"));
  });
});

/* —— cron 档位：避开整点（2026-10-05 修）——
   病根：原档位分钟位是 0（整点）。Actions 官方文档《Events that trigger workflows》点名整点是
   高负载时段：「High load times include the start of every hour... some queued jobs may be
   dropped.」本仓实测 13 次调度的延迟（相对档位起点）最高 5.94 小时，已吃满整整一个 6h 周期，
   症状就是「档位看起来丢了」——它不是停摆，是被排队挤掉了。
   现改为分钟位 23（小时位仍是每 6 小时一次，频率未动），触发点 00:23 / 06:23 / 12:23 / 18:23 UTC，
   只把起点挪出整点那批争抢 runner 的队列。
   （本段刻意不写 cron 字面量：小时位那段里的「星号+斜杠」会提前闭合块注释，esbuild 直接报
    Unexpected "*"，整份测试文件连同其它 30 个文件一起变红——踩过一次，别再写进来。）
   只靠上面那条 toEqual 钉字面量是不够的：谁把 cron 改回整点并顺手改了这条字面量，测试照样绿、
   病照复发。所以把「分钟位 ≠ 0」单独钉死——它只管分钟，改回整点必红，改频率不误红（频率由
   上面那条 toEqual 管），两条断言各管一件事，互不遮蔽。 */
describe("cron 档位（避开官方点名的整点高负载时段）", () => {
  it("crawl 的 cron 分钟位不为 0：整点排队任务可能被丢弃", () => {
    const fields = String(crawl.on.schedule[0].cron).trim().split(/\s+/);
    expect(fields).toHaveLength(5); // 标准 5 段 cron；写成 6 段（带秒）会被 GitHub 判为非法
    expect(fields[0]).not.toBe("0");
  });

  /* —— openrouter 这条**刻意相反**：分钟位就是 0（每日 06:00 CST = 前一日 22:00 UTC）——
     为什么不跟着 crawl 一起挪走？两条的档位密度根本不同：
       crawl  一天 4 档（每 6 小时一次），延迟以小时计、且会吃满整个周期（本仓实测最高
              5.94h），所以必须把起点挪出整点那批抢 runner 的队列；
       or     一天只有 1 档，延迟几小时对「免费模型台账」这种事实型数据的新鲜度毫无影响，
              而 06:00 CST 是对读者友好的时刻（早上看正好是昨天定下来的账）。
     代价（一天 1 档的量级下，官方点名的高负载时段挤掉一次，次日自愈）远小于收益。
     所以这里的分钟位 0 是**决定**、不是遗漏——把它钉成红线，防止将来有人看到 crawl 改
     非整点就顺手把这条也「对齐」掉。（字面量由上面那条 toEqual 管，本条只钉性质：
     改回整点必红，改小时位 22 不误红——那是 06:00 CST 这个对外时刻本身的改动，
     属于要重新拍板的事，得连字面量一起改、被 review 看见。） */
  it("openrouter 的 cron 保持整点：06:00 CST = 22:00 UTC，整点是刻意选择", () => {
    const fields = String(orCrawl.on.schedule[0].cron).trim().split(/\s+/);
    expect(fields).toHaveLength(5); // 同上：5 段标准形态，防「带秒的 6 段」这种非法配置蒙混过关
    expect(fields[0]).toBe("0");
  });

  /* 防「口径泛化」这条后路：把 crawl 的「分钟位 ≠ 0」泛化成「所有 workflow 的分钟位都不为 0」，
     会让 or 的整点选择立刻变红，从而逼迫后来者把一个刻意决定悄悄改掉——泛化本身才是回归。
     本条同时看两条 workflow 的分钟位，并要求它们**方向相反**（crawl 非 0、or 为 0）。
     注意这是与上面两条独立的第三道闸：把 crawl 改成整点时它会红，把 or 改成非整点时它也会红，
     所以它在「两条都被顺手改成同一个值」时同样会红。 */
  it("两条 workflow 的分钟位口径相反且互不遮蔽：crawl 非整点、or 整点（泛化即回归）", () => {
    const crawlMinute = String(crawl.on.schedule[0].cron).trim().split(/\s+/)[0];
    const orMinute = String(orCrawl.on.schedule[0].cron).trim().split(/\s+/)[0];
    expect(crawlMinute).not.toBe("0");
    expect(orMinute).toBe("0");
  });
});

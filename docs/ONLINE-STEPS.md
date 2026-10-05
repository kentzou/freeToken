# 线上步骤清单（仅仓库所有者可执行）

代码与配置全部就位且本机实证（见 PIPELINE-ACCEPTANCE.md）。本文件按序列出 GitHub 侧动作；凡管线写操作（提交/Issue/合入/发布）本地一律未执行，在此兑现。

## 1. 建远端仓库并推送
新建**公开**仓库（名字决定 Pages 域名 `https://<user>.github.io/<repo>/`，绑定自定义域名前可后改）。
`git remote add origin git@github.com:<user>/<repo>.git` → `git push -u origin main`

## 2. Actions 写权限
Settings → Actions → General → Workflow permissions → 选 **Read and write permissions**（workflow 内的 permissions 声明可能被组织级默认压制）。

## 3. 预建标签
Issues → Labels 新建 `review`（红）与 `auto`（绿）——管线靠它们分拣审核/通知 Issue。

## 4. 发布闭环（关键决策）
GitHub 防递归成文行为：默认 GITHUB_TOKEN 的 push **不会**触发 deploy.yml。二选一：
- **方案 A（推荐，全自动）**：fine-grained PAT（仅本仓库、Contents: Read and write）存为仓库 secret `TFN_PUSH_TOKEN`；把 crawl.yml 两个 push 步骤中的 `git push` 替换为
  `git push https://x-access-token:${{ secrets.TFN_PUSH_TOKEN }}@github.com/${{ github.repository }}.git HEAD:main`
  （PAT 值绝不进日志；改完手动跑一次 crawl 确认 deploy 被触发）。
- **方案 B（零配置，接受延迟）**：不改。data 提交后不自动发布，下一次人工 push 或对 deploy 手动 Run workflow 才上线。

## 5. 首跑爬取
Actions → crawl → Run workflow。健康空跑应显示「无实质数据变化，跳过提交」（上游镜像没动就该这样）。`meta.lastSyncedSha` 变真后重点复验：首页 stale 黄条（Task 7 已挂载化）与详情页「最后核验」文案。
注（计划 2.5 已落地）：上游 `app.js` 已删除、改由根目录 `data.json` 承载，`UPSTREAM_RAW` 与提取层已同步切换（详见 PIPELINE-ACCEPTANCE §10）。本步现在可以执行：Actions → crawl → Run workflow，预期首跑结果取决于 `data/meta.json` 的 `lastSyncedSha`——本地种子阶段它是 `null`，所以首跑**必然**判为「有变化」并走完整链路（拉源 → 分层合并 → 三分类 → 写产出文件）。
但其后的「开 Issue」与「提交数据」两步是**有条件**的，别把首跑当成一定会开单：通知 Issue 只在 `diff.added` 非空时开（`crawler/run.mjs:161`）、
审核 Issue 只在 `pending.changes` 非空且与仓库现有 pending 不同键集合时开（`crawler/run.mjs:171`），
数据提交还要过 `git diff --cached --quiet` 守卫（`.github/workflows/crawl.yml:37`，无实质变更打印「跳过提交」）。
健康信号：日志出现 `crawl 完成：新增 N · 修改 M · 删除 K · 规则 R · pending P · sha xxxxxxxxxx`，且 `data/donots.json`、`data/rules.json` 不在提交差异里（Q4/Q5：两表本地权威，上游不再承载）。若出现 `data.json 解析失败` 或 `items 缺失或为空`，是上游形态变了（fail-stop，未写坏任何数据），按 §10 口径重取快照。

## 6. 审核闭环演练
真实变更出现时：pending/changes.json 入库 + review Issue 自动开 → 评论 `/approve card:名称`、`/reject watch:名称` 或 `/approve all` → 观察合入提交、回执评论与 Issue 自动关闭；校验不过会整体失败并留痕（宁可不合不半合）。
注（计划 2.5 终审 (C) 落地后的运维口径，以下形态本机逐条实测 `parseCommands`）：
- **触发只看 label，且排除 PR**：`crawl.yml` 的 review job 条件已放宽为 `issue_comment` + Issue 带 `review` 标签 + **不是 PR**（`github.event.issue.pull_request == null`，`crawl.yml:49-52`），不再对评论正文做大小写敏感的 `startsWith` 前缀判定。因此 `/APPROVE`、` /approve`（前导空格）、「说明文字 + 换行 + 指令」现在都会启动审批 job——旧注里「必须小写且行首无空格」的约束**已失效**。排除 PR 是整枝终审必修补上的：`issue_comment` 事件对 Issue 与 PR 的评论一视同仁，带 `review` 标签的 PR 一旦起本 job，checkout 拿到的是该 PR 合并态的 `pending/`，等于把审批授权面从「本仓 Issue」扩到「任意被打标的 PR」。
- **代价知情项（计划 2.5 口径回填）**：触发面既然不看正文，`issue_comment` 的 `types: [created]` 就意味着**审核 Issue 下的任何一条评论都会启动一次 review job**（提问、说明、贴图说明同样起 job，每次消耗一个 runner 任务）；正文不含指令时 `parseCommands` 返回空数组，`runReview` 给出 `changed:false` 后空跑退出。
- **指令建议独占一行**，这样回执评论与本人预期一一对应，便于事后审计。
- **不会被执行的写法**（安全失败，审批不生效需重发）：引用块 `> /approve all`、同行夹在正文后 `顺便 /approve card:甲`。
- **反而会被执行的写法（意外执行面，注意）**：4 空格缩进 `    /approve card:甲`、围栏代码块里的 `/approve card:甲`——GitHub 把它们渲染成代码展示给后人看，但 job 拿到的是原始正文，指令照样生效。**不要在评论正文的示例/截图说明里贴完整指令**，需要举例时写成 `／approve`（全角斜杠）或加引用块前缀。
- 不写盘的收尾有两种成因，日志分开发声（`crawler/review.mjs` 的 `noChangeNote` 按 `parseCommands` 是否出词二择；`scripts/review-apply.mjs` 只是打印它、并在名单闸之前不动用它）：
  ① 正文里压根没有指令 → 打印「评论不含指令，跳过」，此路径在 `runReview` 里早退，**零 GitHub 写操作**；
  ② 有指令但一条都没合入（id 未命中或已全部处理完）→ 打印「评论含指令但无可合入项（id 未命中或已全部处理），跳过」，
  此路径**仍会回执一条评论**（列出「未找到」的 id；pending 本已为空时还会尝试关闭 Issue），只是不写任何数据文件。
  两者都零写盘，但②的含义是「评论送进来了、只是没生效」，排查方向与①完全不同，故整枝终审要求分开出声
  （`tests/review-apply.test.ts` 的空跑兜底例钉①的 `changed:false` 早退，`noChangeNote` 例钉两条措辞）。
- **审批授权面治理（计划 3 裁决 ① 落地后的新形态）**：能起 job ≠ 能盖章。review job 会先比对评论者 login ∈ `config/site-config.json.adminLogins`，非白名单只回执一条 `⛔ 无权限：…` 然后退出，**一条数据都不合**；`[bot]` 结尾的评论（含本 job 自己发的回执、crawl job 的提交评论）不再起 job。因此：
  ① `adminLogins` 为空时**所有** Issue 审批评论都会被拒——填名单是启用审批的前置动作，不是可选项；
  ② 被拒的人会收到一条机器人评论，这是设计中的公开留痕，不是故障；
  ③ 名单改动只对**之后**的评论生效（job 读的是触发提交工作树里的那份配置）。

## 7. Lighthouse 与 Pages
deploy.yml 首次全绿即已发布（Settings → Pages 显示 live URL）。三门禁读数在 lighthouse job 摘要的 temporary-public-storage 链接；连续不达标先修码，不动门槛值。

## 8. 站点绝对 URL（OG/canonical）
deploy.yml 已按仓库注入 `NEXT_PUBLIC_BASE_PATH` 与 `NEXT_PUBLIC_SITE_URL`（github.io 形态）。绑自定义域名时只改这两处 env + Settings → Pages → Custom domain，代码零改动（终审 #5 的留白就此闭合）。

## 9. 节奏与费用
两条 cron 都按 UTC 写（Actions 的 `schedule` 不认 `timezone` 字段）：

- `crawl.yml` = `23 */6 * * *` → 北京时间 **08:23 / 14:23 / 20:23 / 02:23**。分钟位刻意避开整点：官方点名整点是 runner 争抢的高负载时段，本仓实测延迟最大 5.94 小时，起点错开整点能挤进队列。
- `crawl-openrouter.yml` = `0 22 * * *` → 北京时间 **06:00**（前一日 22:00 UTC）。一天只有 1 档，延迟不影响台账新鲜度，保持整点这个对读者友好的时刻更值得。

分钟位被 `tests/workflows.test.ts` 钉成红线，改 cron 必须连同那两条断言一起改。公开仓库 Actions 免费；单跑≈构建 3–5 分钟 + Lighthouse 1–2 分钟。

## 10. /admin 后台启用（Day-1 必做，计划 3）

`/admin` 是纯静态客户端页面：浏览器直接带设备令牌打 `api.github.com`。代码与单测已本机实证（见 ADMIN-ACCEPTANCE.md），以下是只有仓库所有者能做的线上动作，按序执行。

1. **填 `config/site-config.json` 的 `adminLogins`**（GitHub 登录名数组，大小写不敏感、不得含空格或 `/`）。空数组＝后台与 Issue 审批两条路全部 fail-closed 拒绝。
2. **建 GitHub OAuth App**（Settings → Developer settings → OAuth Apps → New）：Homepage 填 Pages 站点 URL，**Authorization callback URL 留空或填站点 URL 均可**（Device Flow 不走回调），勾选前记下 `Client ID` → 填入 `config/site-config.json` 的 `oauthClientId`。缺它时 `/admin` 显示「未配置」引导态（`resolveView` 的 `unconfigured`）。
3. **确认 `githubRepo`**：`config/site-config.json` 的 `githubRepo` 必须是 `owner/repo` 形态且与实际仓库名一致——后台所有读写都按它寻址，Pages 域名改了不会自动改它。
4. **Actions 写权限**（§2 的既有动作之外，还需确认 review job 的 `GITHUB_TOKEN` 能发评论与关 Issue：`permissions: issues: write` 已在 yml 顶层声明）。
5. **浏览器侧可达性首查**（ADMIN-ACCEPTANCE §7 的未取证项）：完成一次 Device Flow 登录，观察 ① 浏览器是否被 `api.github.com` 的 CORS 放行 ② `/user` 返回的 login 是否与名单一致 ③ Contents PUT 是否成功（403 且提示 scope 不足＝令牌 scope 问题；409＝同一文件被并发改动，后台按设计只重试该文件）。
6. **发布闭环**（§4 的方案 A/B 决策）：`/admin` 走 Contents PUT 提交，其 commit 由令牌所属用户产生，**会**触发 `deploy.yml` 的 push paths 过滤——即后台发布天然上线，不依赖 `TFN_PUSH_TOKEN`；`crawl.yml` 的自动提交仍需该 PAT 才能触发下游（方案 A）。
7. **计划 4 之后再回来**：`/admin` 路由、`robots.txt`/noindex、`.adm-*` 样式与九种状态实触发都在计划 4；本计划的收口态**没有任何 `/admin` 页面可访问**（`out` 仍是 25 个 HTML、build 26/26）。

8. **计划 5 已落地**（原第 7 条的「计划 4」，判读规则见 `ADMIN-UI-ACCEPTANCE.md` §4）：`/admin` 路由与四标签、`.adm-*` 样式、十二态、`/admin` 的 meta robots `noindex, follow` 均已进产物；第 1–7 条的线上动作不变，其中第 2 条（`oauthClientId`）缺失时页面显示 `unconfigured` 引导态并指向本步。

## 11. 同一份导出放到第二个主机上（副本站）：`SITE_ROLE`

静态导出不知道自己会被放到哪个主机上，所以部署口径必须显式声明。**为什么这是一条线上步骤而不是代码注释**：
2026-10-05 实测到的线上缺陷正是"同一份产物换了主机、绝对地址没跟着换"——副本站那份的 26 条 sitemap loc
与每页 canonical 都写着 `token-fbi.com`（原作者的活站），逐个探测只有 3 条 200；
等于每个页面都在告诉搜索引擎"正式地址在别处"，而那个地址上没有对应页面。重构建修不掉它，
因为值不在仓库里，是当时构建命令行上带了那个 `NEXT_PUBLIC_SITE_URL`。

口径由构建期变量 `SITE_ROLE` 声明，只有两支；`deploy.yml` 不设它，Pages 那条链路走 `primary`，零改动。

| 口径 | canonical / og:image | 每页 `meta robots` | `robots.txt` | `sitemap.xml` |
| --- | --- | --- | --- | --- |
| `primary`（缺省） | 指本站 | 不写 | 带 `Sitemap:` 行 | 生成 |
| `mirror` | 指**主站**地址 | `noindex, follow` | 只有 `User-agent`/`Allow` | **不生成** |

两条设计约束，改代码前先看：

- 副本站**不许自带**一份 loc 指向主站的 sitemap：按 sitemaps.org，`loc` 必须与 sitemap 文件所在主机同源，
  跨主机那份需要另行验证才生效——放在副本站上是静默无效，比 404 更难被发现。
- 用 `noindex, follow` 而不是 `robots.txt` 里的 `Disallow`：爬虫照样顺链抓取，能在同一页同时看见
  noindex 与 canonical，两个信号不打架（`Disallow` 会让它两个都看不见，归权链就断了）。

副本站重发（本机实测过的命令与读数，在 `token-fbi-next` 里跑）：

```bash
SITE_ROLE=mirror NEXT_PUBLIC_SITE_URL=https://kentzou.github.io/freeToken npm run build   # ✓ 34/34 页
SITE_ROLE=mirror NEXT_PUBLIC_SITE_URL=https://kentzou.github.io/freeToken npm run seo     # [seo] robots.txt 已出（mirror）；镜像口径不供 sitemap
SITE_ROLE=mirror NEXT_PUBLIC_SITE_URL=https://kentzou.github.io/freeToken npm run test:out # ℹ pass 10 / ℹ fail 0
```

- 副本站挂在自家主机根路径上，**不要**设 `NEXT_PUBLIC_BASE_PATH`（设了资源前缀会变成 `/freeToken/_next`，
  在副本站那台主机上取不到）。
- 换口径重跑 `npm run seo` 时，`mirror` 会**删掉** `out/sitemap.xml`（若上一轮按主站跑过，那份「loc 全是别人地址」
  的清单还躺在磁盘上；robots.txt 不声明它，不等于爬虫猜不到这个路径）。`next build` 本身会清空 `out/`，
  所以只有"不重建、只重跑 seo"这条路径会碰到它。
- **换口径必须连 `build` 一起重跑**：只重跑 seo 会得到「主站口径的页面 + 镜像口径的抓取面」这种混合态。
  本机实测这种态下 `npm run test:out` 红在两条（`robots.txt 随产物落地…` 与 `/admin 已进产物且带 noindex`），
  因为页面里没有 `noindex` 标签——**这是保护，不是故障**：产物与口径不一致就别往外发。
- 三条产物核对由 `tests/build-output.test.mjs` 在 `SITE_ROLE=mirror` 下逐页自动做（sitemap 不存在、
  robots 无 `Sitemap:` 行、每一页 HTML 都带 `noindex, follow`），不必手工重复；`test:out` 就是那道闸。
  本轮实测：33 份 HTML 全部带标签，首页 canonical 落成 `https://kentzou.github.io/freeToken/`，
  详情页与 `og:image` 同主机；`out/sitemap.xml` 不存在。
- `SITE_ROLE` 拼错就地失败，不会静默按主站出产物：`npm run seo` 退出 1 并点名收到的值
  （`[seo] SITE_ROLE 只接受 primary|mirror，收到 "Mirror"`），`src/lib/siteRole.ts` 在构建期抛。
  校验在 `scripts/gen-seo.mjs`（抓取面）与 `src/lib/siteRole.ts`（页面 meta）各有一份，
  用例分别钉在 `tests/seo.test.ts` 与 `tests/site-role.test.ts`，两处的判定表一致。
- 上传动作本身仍是人工闸门，不在本文件范围内（见外层 `docs/PUBLISH-NOTES.md`）。

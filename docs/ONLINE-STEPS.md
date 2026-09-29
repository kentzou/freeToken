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
注（Task 8 评审修订回写）：上游已删除 app.js 改用 data.json（实证见 PIPELINE-ACCEPTANCE §3 形态③），计划 2.5 数据源适配落地前本步首次 Run 必然 404 fail-stop（`crawl 中止…HTTP 404` 非 0 退出，安全失败不写坏数据，非本地代码 bug）；适配合入后再执行本步。

## 6. 审核闭环演练
真实变更出现时：pending/changes.json 入库 + review Issue 自动开 → 评论 `/approve card:名称`、`/reject watch:名称` 或 `/approve all` → 观察合入提交、回执评论与 Issue 自动关闭；校验不过会整体失败并留痕（宁可不合不半合）。
注（终审 (C) 运维口径）：审批评论须**小写** `/approve`、`/reject` 且**行首无空格**——workflow 触发条件 `crawl.yml:45` 用大小写敏感的 `startsWith`，比解析器 `parseCommands`（带 `/i`、容忍前导空白）更严；写成 `/APPROVE` 或 ` /approve` 不会启动审批 job（安全失败，不会误合入，但你的审批不生效需重发）。代码级放宽登记在计划 2.5。

## 7. Lighthouse 与 Pages
deploy.yml 首次全绿即已发布（Settings → Pages 显示 live URL）。三门禁读数在 lighthouse job 摘要的 temporary-public-storage 链接；连续不达标先修码，不动门槛值。

## 8. 站点绝对 URL（OG/canonical）
deploy.yml 已按仓库注入 `NEXT_PUBLIC_BASE_PATH` 与 `NEXT_PUBLIC_SITE_URL`（github.io 形态）。绑自定义域名时只改这两处 env + Settings → Pages → Custom domain，代码零改动（终审 #5 的留白就此闭合）。

## 9. 节奏与费用
cron `0 */6 * * *` 为 UTC（北京时间 8/14/20/2 点）。公开仓库 Actions 免费；单跑≈构建 3–5 分钟 + Lighthouse 1–2 分钟。

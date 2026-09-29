# 阶段 D · 爬取发布管线验收记录（计划 2）

验收日期：2026-09-29（本机实测）｜仓库状态：main @ `7ef8265`（Task 7 提交，门禁实测时的仓库 HEAD；本验收记录随 Task 8 docs 提交落库）
原则：凡本机亲测才写「已实测」；GitHub 写操作（数据提交/Issue/合入/发布）只交付 payload 断言与 YAML 推演，真实执行见 docs/ONLINE-STEPS.md（用户裁决：线上步骤留出）。

## 1. 门禁总览（本任务 Step 1 实测）

| 门禁 | 期望 | 实测 |
|---|---|---|
| vitest | 122/122（71 基线 +14+8+7+9+6+7，逐任务累加） | `Test Files 15 passed (15)`，`Tests 122 passed (122)`，EXIT=0 |
| tsc | EXIT=0 | `npx tsc --noEmit` 无输出，EXIT=0 |
| build | 28 页 | `✓ Generating static pages (28/28)`，EXIT=0 |
| test:out | 5/5 | `tests 5 / pass 5 / fail 0`，EXIT=0 |
| seed:repro | fixture 7f8c5cb80c9138c4 + 双跑三哈希一致 | `seed 复现 OK：cards=f9ce0bf225e3 donots=88f99a96da35 rules=7888f2ec168b`，EXIT=0（sha16 校验通过：脚本未打印「fixture 快照漂移」即命中 `7f8c5cb80c9138c4`，见 seed-repro.mjs 第 15–18 行守卫） |
| 泄漏红线（扫描面 data/out 产物） | 零命中 EXIT=1 | 命令 `grep -rlE "lmfh2022\|ygtxup80\|CQLBPC\|AATGOEHF\|userCode=\|invite_code=\|poster-doubao" data out` → 无任何文件命中，EXIT=1（评审修订：表内 `\|` 是 markdown 表格单元格对竖线的强制转义，命令原文为普通 `|` 分隔的正则交替——grep -E 中 `\|` 反而是字面竖线，照抄转义版会成恒零命中的假红线，复跑须用 plain `|`） |

## 2. 三分类与两队列分流（spec §7.6）

- diff.test 8 例：注入新卡→added、字段级 fields 比对（undefined≡null 特判）、规则表五表整表级、fixture sha 钉版。
- run.test 9 例：新增直接入库；修改/删除 data 持旧值 + pending 携 after；规则任一变动整表持旧；mergePending 同键取最新；假 transport 端到端 Issue payload（labels/title/body 含 keyOf id、/approve、上游 sha）；同批未变不重复开审核 Issue（防 6h 刷屏）；notify 标题「新增 N」。
- approve.test 6 例：approve 取 after／删除类 after=null 剔除／watch 与规则整表替换／reject 只消费不动 data／校验红线不过整体不合入（宁可不合不半合）／missing id 如实报告。
结论：Task 2 收尾 `Tests 93 passed (93)`（10 文件，EXIT=0）· Task 4 收尾 `12 文件 / 109 passed (109)`（EXIT=0）· Task 5 收尾 `115 passed (115)`、13 个测试文件全绿（EXIT=0），与本文 §1 的 122/122 构成 93→100→109→115→122 的逐任务累加链，既有用例零改动全绿。「修改+删除不自动入库」符合决策 #7。

## 3. 真拉演示（只读 GET）

命令 `npm run crawl`（不带 token，禁写 Issue），日志全文 `../.superpowers/sdd/p2-crawl-demo.log`；演示后 `git checkout -- data pending` 还原。
逐行摘录：

```text
crawl 中止：读取上游最新 commit 失败：HTTP 403（hope0719/token-fbi）
sleeping 1578s until rate reset
== 演示 A：npm run crawl（真实 CLI，无 token） Tue Sep 29 11:10:25 UTC 2026 ==
crawl 中止：GitHub 请求失败（重试 3 次）：GET https://raw.githubusercontent.com/hope0719/token-fbi/main/app.js → fetch failed
EXIT=1
== 演示 B：fetchImpl 只读改道 api.github.com/contents（本机 raw 域名无 DNS），crawlOnce 真拉全链路 Tue Sep 29 11:10:51 UTC 2026 ==
Error: 拉取 raw 源文件失败：HTTP 404 https://raw.githubusercontent.com/hope0719/token-fbi/main/app.js
EXIT=1
== 演示 C：真实 main sha（ls-remote）× 真实 app.js 快照（Task2 fixture）→ crawlOnce 全链路 Tue Sep 29 11:14:58 UTC 2026 ==
真实上游 main sha（ls-remote）：6d88f5b26793f667aa65ac30bc3b21ebeeb69872
crawl 完成（全链路，只算不写盘）：新增 0 · 修改 0 · 删除 0 · 规则 0 · pending 0 · sha 6d88f5b267 · 产出文件 data/tokens.json, data/donots.json, data/rules.json, data/meta.json
counts：{"tokens":39,"donots":22}
EXIT=0
```

本机实况四种形态如实入档：① 共享出口 IP 的 api.github.com 匿名配额 60/h 耗尽（HTTP 403，等重置约 1500s）；② raw.githubusercontent.com 本机 DNS 不可解析，GET 重试 3 次后 `fetch failed`，CLI 以 `crawl 中止` 非 0 退出且不写盘；③ 只读改道 contents API 后 404——重大实证发现：上游 `hope0719/token-fbi@main` 根目录已无 `app.js`（已重构为 `data.json` 驱动），`UPSTREAM_RAW` 指向的旧路径在线上首跑必然 404 fail-stop；④ 降级实证（演示 C）：`git ls-remote` 取真实 main sha × Task 2 真实 app.js 快照喂 `crawlOnce` 全链路，EXIT=0 且与现基线逐条一致（counts 39/22），只算不写盘。
结论：真实数据源形态变更下的**成功真拉未实测**——raw 域名不可达 + 上游 app.js 已下架，按 spec §11.1 降级：fixture 实证（run.test 第 7–9 例注入 sourceText），线上首跑列入 ONLINE-STEPS #5；上游数据源适配属计划 2.5（映射方案已交付、用户九问已拍板），未在本计划内冒充成功真拉，无任何假数据。数据洁净复核（本任务 Step 1 实测）：CLI 中止未写盘，`npm run seed` 输出 `seed 完成：tokens=39 donots=22` 后按纪律 `git checkout -- data/meta.json` 还原时间戳 churn，末了 `git status --porcelain data pending` 与 `git status --porcelain` 均为空。

## 4. 调用层边界与重试纪律

GET 重试 3 次指数退避 [1000,4000,10000]、POST/PATCH 不重试（github.test 假 transport 计时断言 slept=[1000,4000]、422 仅 1 次调用）；headStatus 永不抛（warn-only）。所有写调用仅 payload 断言，未真实执行。

## 5. 两份 workflow 推演（不执行）

触发链：crawl.yml — schedule（`0 */6 * * *` UTC）/workflow_dispatch → crawl job（run.mjs → git 提交 data/pending）；issue_comment（label 含 review + 正文以 /approve|/reject 开头）→ review job（review-apply.mjs → applyDecisions → 提交）。deploy.yml — push paths 过滤 → vitest+tsc+seed:repro+build+test:out → Lighthouse 三门禁（LCP≤2500ms、CLS≤0.1、A11y≥0.95，preset desktop）→ NEXT_PUBLIC_BASE_PATH/SITE_URL 重建 → deploy-pages。
**已知限制（GitHub 成文行为，本机不可实证）**：Actions 用默认 GITHUB_TOKEN 产生的 commit 不触发后续 workflow（防递归），故 crawl/review job 的 `git push` 默认点不着 deploy.yml——Task 6 推演 ① 以此为前提修正。解法二选一见 ONLINE-STEPS #4（推荐 PAT secret）。
Task 6 推演记录 ①–④（原文照录，① 已带上述防递归注记；四条均属 Task 6 那次整体评审 Approved 的交付物，未对每条单独立复核记录，GitHub 侧一律未执行）：
① crawl job push data → 触发 deploy.yml paths 过滤 → 发布，闭环成立——**前提是 push 带 PAT**；GitHub 成文防递归行为：默认 GITHUB_TOKEN 产生的 commit 不触发任何后续 workflow，届时 ① 降级为「人工 push / deploy 手动 dispatch 才发布」。解法与取舍在 Task 8 的 ONLINE-STEPS #4（推荐方案 A：TFN_PUSH_TOKEN）。
② review job 只在 label 含 review 的 Issue 上响应，`secrets.GITHUB_TOKEN` 在自己的 Issues/repo 有写权限（permissions 已声明）。
③ crawl job 自身的 commit push 带 `[bot]` author——deploy.yml 无作者过滤，会发布（预期行为）；crawl.yml 的 push 事件不会误触发 crawl（schedule/dispatch only，push 不在 on 列表）。
④ lighthouse job 的 `serve &` 后台进程在同 run 内共享网络命名空间（官方 runner 单 job 同容器，成立）。
另有 Task 6 修订波两处已落地（提交 `85c73fc`）：deploy-pages@v4 的输出名对齐官方 `page_url`（避免空 URL），Lighthouse 前加本地起服 curl 探活（避免随机红灯）——均为 YAML 层面修正，结构校验由 workflows.test 3 例覆盖，真实执行仍属线上。

## 6. 遗留闭环（对计划 1 UI-ACCEPTANCE §6）

条目 4（axe/Lighthouse 属计划 2）→ 门禁配置+推演已交付，线上首跑见 ONLINE-STEPS #7；条目 5（远端/Pages 属计划 2）→ 步骤清单 ONLINE-STEPS #1–#3、#7；条目 7（stale hydration）→ Task 7 改挂载后计算，风险消解，真实 SHA 上线后复验列入 #5。

## 7. 诚实缺口清单

远端仓库、PAT、Pages、cron 首跑、真实 Issue 开/审/合、Lighthouse 首跑、真实 lastSyncedSha 下的 stale 与期号展示——均属线上步骤；代码与文档接缝已备好，无一遗漏地登记在 ONLINE-STEPS。

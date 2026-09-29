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

## 8. 计划 1 终审 12 项遗留 → 落地实证回填（whole-branch 终审 2026-09-29）

| # | 遗留 | 证据（文件:行 / 用例 / 提交） | 判定 |
|---|---|---|---|
| 1 | 详情页版式 `.intel-detail`/`.fact-table` 对齐原型 | `src/styles/app.css:446-453`（原型 L241-249 逐值）；`7ef8265` | ✅ |
| 2 | 隐私页「界面偏好」措辞改单键事实 | `src/app/privacy/page.tsx:10`（仅 `tfb-theme` 一项）；`7ef8265` | ✅ |
| 3 | seed 可复现 CI 双跑哈希（排除 `meta.lastSyncedAt`） | `scripts/seed-repro.mjs` + `deploy.yml` seed:repro 步；§1 记三哈希 `f9ce0bf225e3/88f99a96da35/7888f2ec168b`；`4ca5f5a` | ✅ |
| 4 | `compiledRules` 可读键报错 + 写入侧校验 | `src/lib/rules.ts` `logo#i(slug)`；`crawler/validate.mjs:21`（`b1ef0f5` 追加 `Array.isArray(regionByName)` 守卫）；`08073b2`/`b1ef0f5` | ✅ |
| 5 | OG/canonical env 留白 | `layout.tsx` `metadataBase`←`NEXT_PUBLIC_SITE_URL`；`intel/[slug]` `alternates.canonical`；`deploy.yml` environment 用官方 `page_url`（`85c73fc`） | ✅ |
| 6 | build-output 红线接 CI | `deploy.yml` `test:out` 步 + `workflows.test` 例 2 断言；§1 记 5/5 EXIT=0；`4ca5f5a` | ✅ |
| 7 | featured-grid 移动断点 + CTA 全宽 | `app.css:252-258`（899 featured-grid 单列 + 639 `.card-action` 全宽）；`7ef8265` | ✅ |
| 8 | `splitNumbers` 文档化降级 dormant | `src/lib/copy.ts:105-107` 注记（不接 UI，唯一实现声明）；`7ef8265` | ✅ |
| 9 | `stale` `Date.now()` 改挂载后计算 | `HomeClient.tsx:44-49` `useState(false)`+`useEffect`（SSR 恒 false，杜绝 hydration）；`7ef8265` | ✅ |
| 10 | `linkRisk` 强制 https 封堵无协议绕过 | `crawler/clean.mjs` `parseLoose` bare 分支 + 伪协议封堵；`clean.test`「无协议绕过封堵」7 例；`08073b2`+`3befd11`（计划回写 `003bb72`，用例阶梯 85→122） | ✅ |
| 11 | SectionNav/移动断点对齐原型 899 | `app.css:363-390` 899 折叠块 + 639 dateline 块；`7ef8265` | ✅ |
| 12 | spec §6 `issueNo` 过期脚注 | 外层文档（`specs/2026-09-28-ui-redesign-crawler-design.md:166`，随外层 bundle 提交）；内层 `grep issueNo docs/PIPELINE-ACCEPTANCE.md`=0，未误归内层 | ⚠️ 外层 |

小结：11 ✅ + 1 ⚠️（外层文档，非内层缺陷）+ 0 ❌。终审门禁亲验：`npm run test` 122/122 EXIT=0、`tsc --noEmit` 0、泄漏 grep（扫描面 data/out）EXIT=1、`git status` 全净、单一实现红线（linkRisk/dump/buildSeed/reviewIssueBody/validate/applyDecisions/keyOf 各一处定义、全仓复用）核过无第二套。

## 9. whole-branch 终审遗留裁决（Ready to merge，必修零条）

终审判定「可合入，必修清单为空」；下列遗留经主控复验后**全部记入本节**（符合完成判据 #4「修或记，无第三条归宿」），均为 fail-safe 或 plan-mandated：

- **(C) 审批评论门大小写/前导空白口径**（真问题·非阻断）：`crawl.yml:45` job `if` 用 `startsWith(comment.body,'/approve')||startsWith(...,'/reject')`——GitHub 表达式大小写敏感且不容前导空白；而 `review-apply.mjs:14` `parseCommands` 带 `/i` 且 `^\s*`。门触发面是解析面的**子集**，故 `/APPROVE …`、` /approve …` 这类评论**不会启动 review job**（Nothing 发生），**不存在越权误合入**——方向安全。运维口径见 ONLINE-STEPS #6：审批评论须小写 `/approve`、`/reject` 且行首无空格。代码级放宽（job `if` 只按 `label=review` 触发、命令取舍全交已单测的 `parseCommands`）登记为计划 2.5 项。
- **(D) `runReview` 内联 keyOf 同形串**（plan-mandated·非缺陷）：`review-apply.mjs:32` 用 `` `${e.kind}:${e.name}` `` 内联而非 `import { keyOf }`——语义与 `diff.mjs:5` 逐字一致，是同一格式串的复用非第二套逻辑；计划 2.5 统一改为 import。
  > **2026-09-29 换代注（计划 2.5 Task 3 落地，内层 `5da38ed` + 修复波 `dcc8a30`；上两条为修复前状态记录，按「历史正文不删改」口径原样保留）**
  > (C) 已代码级放宽：review job 的 `if` 现在只看 `issue_comment` 与 `label=review`（`crawl.yml:44-49`），
  > 前缀判定取消，`/APPROVE`、前导空白、说明行后换行均生效；命令面唯一实现是 `review-apply.mjs:12` 的 `parseCommands`，
  > 无指令评论在 `:30-31` 早退（`changed:false`、零 GitHub 调用），由 `tests/review-apply.test.ts` 空跑兜底例钉住。
  > 因此上文「运维口径见 ONLINE-STEPS #6：须小写且行首无空格」**已作废**，现行运维口径以 ONLINE-STEPS §6 为准
  > （含八形态实测名单与「缩进/围栏代码块内指令照样生效」的意外执行面警示）。
  > (D) 已统一为 `import { keyOf } from "../crawler/diff.mjs"`（`review-apply.mjs:34` 走 `.map(keyOf)`），
  > 生产码里 `${e.kind}:${e.name}` 仅剩 `crawler/diff.mjs:5` 一处定义；另一处命中是
  > `tests/approve.test.ts:59` 构造期望值的夹具写法，非第二套实现。
- 其余留档 Minor（各任务评审累积，经终审复核非阻断）：T1 裸 IPv4 走 bare 分支（内部地址风险由审批面承担，缺补测）、models 缺失降级路径可读性、validate.test 第 3 例断言宽度；T2 `JSON.stringify` 键序敏感（后果仅多余 modified 进 pending 更保守）、byName 重名 last-wins（上游名唯一）；T3 非 GET「重试 0 次」措辞、`e.message` 非 Error 退化（brief 逐字）；T4 rules 旧表入库后不复验（brief 原样）；T5 `after=null` 静默过校验、未知 action 按 reject 完结（保守终态）；T6 `crawl.yml` 无 concurrency、`deploy cancel-in-progress:true`（计划逐字）。驳回项：regionByName 数组绕过（`b1ef0f5` 已闭合）、fixture 隔离、notify「逐条 linkRisk」措辞（终审实证 validateCards 硬失败在前、checkLinks 属可达性另一维度）、T7 五组 Minor 观察（评审已实证非问题）。

## 10. 计划 2.5 迁移记录：上游 `app.js` → `data.json`（2026-09-29）

**动因（实证，非推测）**：上游 `hope0719/token-fbi@main` 已删除 `app.js`，结构体改由根目录
`data.json` 承载，旧 `UPSTREAM_RAW` 现返回 404（PIPELINE-ACCEPTANCE §3 形态③ 的首跑观察即此事），
`extractStructures` 的「括号扫描 + vm 求值」已无对象可扫。本机 `raw.githubusercontent.com` /
`api.github.com` 不可达，快照经 git 协议只读克隆取得：26377 B、sha256 前 16 位 `0276a024c4f6e10e`，
落为 `tests/fixtures/upstream-data.json`（另加 `.gitattributes` 的 `eol=lf`，防 Windows 检出转 CRLF 造成假红线）。

### 10.1 切换后基线（本机实测；复现命令见 10.6）

| 量 | 旧（app.js 口径） | 新（data.json 口径） |
|---|---|---|
| 上游条目 | 41 条 `TOKENS` | 36 条 `items`（`tool` 16 · `model` 19 · `event` 1） |
| 入库卡数 | 39（hide 2） | **32**（sponsored 挡架 3 + site-config hide 1） |
| 类型分布 | —— | 工具 14 · 大模型 18 |
| 可见集 | 20 | **18**（大模型 7 · 工具 11 · 限时 4） |
| chip 计数 | —— | all 18 · 生产力 9 · 图像 6 · 语音 1 · 数据 2 · 平台 10 |
| 保留 / 下架 / 新增 | —— | kept 28 · gone 11 · added 4 |
| `latestUpdated` | 2026-09-23 | **2026-09-28** |
| `out/` HTML / build 路由 | 27 / 28 | **25 / 26** |
| seed 三哈希（sha12） | cards `f9ce0bf225e3` · donots `88f99a96da35` · rules `7888f2ec168b` | cards **`ba754253ebaa`** · donots 与 rules **同值不变**（Q4/Q5 直通的哈希级证据） |
| `linkRisk` 全量终审 | 命中 0 | 命中 **0** |
| `[site-config] 未找到卡片` | 0 条 | prune 后 **1 条**（`豆包拉新项目`，见 10.4） |

字段差异实测（28 张 kept 交集上逐键比 `git show 16f60b2^:data/tokens.json`）：`modality`/`quota` **28/28** 全部随上游刷新，
`limited` **25/28**、`updated` **9/28** 亦被刷新（其余持平＝上游该键与本地同值）；`name`/`type`/`link` **0** 差异
（`link` 由 `site-config` 逐卡覆盖全部命中，短链上游值被盖掉）。七个事实键之外的观点键零变化（Q1 分层合并的地基）。
donots 与 rules 与切换前**逐字节一致**（`git diff --numstat -- data/` 只出现
`tokens.json` 与 `meta.json` 两行）。

### 10.2 Q1–Q9 九问裁决 → 落地位置与钉住它的测试

| 裁决 | 落点（单一实现） | 钉住它的测试 |
|---|---|---|
| Q1 事实/观点分层合并（事实 7 键 `name,type,modality,quota,link,limited,updated`） | `crawler/adapt.mjs`：`FACT_FIELDS` + `factPatch` + `adaptItems` | `adapt.test.ts` ⑤⑥⑦；`seed.test.ts`「Q1/Q3/Q9」；`seed-repro.mjs` 幂等闸 b |
| Q2 仅本地存在的 11 张旧卡全部跟随下架 | 结构性保证：`adaptItems` 只遍历上游 `items`，本地多出的卡自然出局 | `seed.test.ts`「Q1/Q3/Q9」内 gone 11 名单断言 `toEqual([])` |
| Q3 `updated` 取上游 `last_verified` | `adapt.mjs` 的 `updated: item.last_verified \|\| ""` | `extract.test.ts` WorkBuddy 样本；`catalog.test.ts` `latestUpdated = 2026-09-28` |
| Q4 donots 转本地维护、`retired` 绝不进观望名单 | `extract.mjs` 只出 `{ items }`（`retired` 不出这道门）；`buildSeed` 直通 `prevDonots` | `extract.test.ts`「出参只有 items 一个键」；`seed.test.ts`「Q4/Q5 直通」；`seed:repro` donots 哈希 |
| Q5 rules 五表转本地固定资产 | `buildSeed` 返回 `rules: prevRules` | `seed.test.ts`「Q4/Q5 直通」；`seed:repro` rules 哈希；`seed.test.ts` 规则表还原例 |
| Q6 `sponsored`/`ad_*` 不进报纸 | `adaptItem` 的 `item.sponsored === true → null` | `adapt.test.ts` ②（真实 fixture 恰好 3 条实名）；`extract.test.ts` 零过滤例 |
| Q7 丢弃 `event`/未知类目 | `adapt.mjs` 的 `CATEGORY_TO_TYPE = { tool, model }` | `adapt.test.ts` ① |
| Q8 4 张新卡全收；小米/豆包维持 hide | `config/site-config.json` 的 `hide` 键未动 | `seed.test.ts`「Q1/Q3/Q9」新增 4 名 + 条数 `36-3-1` |
| Q9 首期带 `Qoder cn` alias | `adapt.mjs` 的 `NAME_ALIAS` | `adapt.test.ts` ④；`seed.test.ts`「上游名不得落库」 |

### 10.3 下架 11 卡实名（Q2，**不得以任何形式复活**）

GLM-5.3-Flash（Ox-Alpha）、蓝博科技（lanbuff）、2026 微信小程序开发大赛、HuggingFace Inference API、
月之暗面 Kimi 开放平台、OpenStarry、腾讯云 TokenHub、太行HUB（token.taiha.cn）、B.AI（AI 模型聚合平台）、
GMI Cloud（gmi-serving）、秒哒（百度）。

其中 `HuggingFace Inference API`、`OpenStarry`、`腾讯云 TokenHub`、`太行HUB（token.taiha.cn）`、
`B.AI（AI 模型聚合平台）` 5 条**同时**存在于 `data/donots.json`（镜像时代即「卡 + 观望项」并存）。
Q4 下 donots 是本地资产、逐字节直通，所以这 5 条仍留在观望名单里——这是「本地资产不动」的结果，
不是「复活被下架卡」：它们不再出现在 `data/tokens.json`（`seed.test.ts` 的 gone 断言只查 tokens）。

### 10.4 site-config prune 范围与预期告警

删除 2 个失效 link 覆盖：`GLM-5.3-Flash（Ox-Alpha）`、`秒哒（百度）`（覆盖对象已按 Q2 下架）。
**保留** `豆包拉新项目`/`小米 MiMo（Xiaomi）` 两个 `hide`（Q8 明示的 sponsored 挡架之外第二道防线）。
代价是每次 seed/爬取打印一行 `[site-config] 未找到卡片： 豆包拉新项目`——**属预期**，
不得为消除告警而删键（计数限定的实测口径：`npm run seed` 输出里 `grep -c "未找到卡片"` 恒为 **1**；
`npm run seed:repro` 是 **3**，因为它在一次命令里把 `buildSeed` 调了三遍（确定性双跑 + 幂等回喂，见
`scripts/seed-repro.mjs` 的 `a`/`b`/`c`），每遍各打印一行；行数随 `buildSeed` 调用次数线性增长，
不属门禁阈值、只用于确认「没冒出第三种缺失卡」）。prune 行为中立：
`seed:repro` 的 `cards=ba754253ebaa` 与 prune **之前**实测同值，两件事互为交叉验证。

### 10.5 观察项（留档不修，附理由）

- `src/lib/catalog.ts` 的 `PRIORITY_MODELS` 里 `/glm-5\.3/i` 已成**死模式**（该卡按 Q2 下架，且 `rank()` 只测 `card.name`）。
  不删：它编码的是「同名模型回归时排在前」的排序意图，将来数据回来即自动生效，删掉反而丢语义、并制造一次无谓的 pin 位次漂移。
- `adaptItems` 对「上游改名但本地无 alias」的情形会表现为「旧卡消失 + 新卡出现」（本次 `Qoder cn` 已补 alias 规避）。
  后续上游再改名时，正确处置是**先加 `NAME_ALIAS` 再同步**，否则该卡的评分/上手指南/pin 会整体丢失——`seed.test.ts` 的 alias 例是此事的回归钉。
- `buildSeed` 的四条护栏（三条基底缺失 + 一条「适配层收取数为 0」下限）在真拉路径（`crawler/run.mjs`）里
  几乎永不触发（`main()` 恒从 `data/` 读三件，爬虫侧另有 `holdCards`：`syncOnce` 把 removed 卡推回 `data.cards`
  并只记进 pending 审核队列，删除不落地），它防的是「新库/误删文件/上游类目字段改名后仍强行发布空壳」，
  属 fail-safe 而非日常分支；四条都有 `seed.test.ts` 的护栏例直接抛错验证（Task 2 Step 8d）。

### 10.6 复验命令（全部本机可跑，零 GitHub 写操作）

```powershell
cd D:\Documents\code\freeTokenInfo\token-fbi-next ; npm run seed ; npm run seed:repro ; npm run test ; npm run build ; npm run test:out ; npx tsc --noEmit
```
期望依次为：`seed 完成：tokens=32 donots=22`、`seed 复现 OK：cards=ba754253ebaa donots=88f99a96da35 rules=7888f2ec168b`、
`Tests 133 passed (133)`、`✓ Generating static pages (26/26)`、`pass 5`、tsc 无输出。

```powershell
cd D:\Documents\code\freeTokenInfo\token-fbi-next ; grep -rlE "lmfh2022|ygtxup80|CQLBPC|AATGOEHF|userCode=|invite_code=|poster-doubao" data out ; echo EXIT=$LASTEXITCODE
```
期望：零输出、`EXIT=1`。

### 10.7 数据安全闸的两种力度：全量归零硬停 vs 部分掉卡出声（复审 I-A）

`npm run seed` 绕过 `syncOnce` 直写 `seed.cards`，所以「上游类目字段半数漂移」（例如 16 条 `tool` 里有 14 条
被改名成 `tools`）不会被删除审核队列接住——它会安静地把 32 张卡覆写成 **19** 张（内存实测 `buildSeed`，不写盘：
改名 14/16 条 → 19 张、降幅 41%；改名 16/16 条 → 18 张、降幅 44%），而那 14 张卡上的手写内容
（`rating`/`effect`/`signup`/`pin`/`badge`/`tone`/`extraAction`/`v2`）**不可由管线重建，误覆写只能 git 回溯**。
据此定两种力度：

- **全量归零 → 硬停**：`buildSeed` 的下限闸抛错（`上游 items 非空但适配层收取数为 0…（决策 Q1 基底保护）`），
  实测 `exit=1` 且 `data/tokens.json` 仍是 32 张——抛点在 `writeFileSync` 之前，不会留下半成品。
  出处＝Task 2 复审波沙箱实证 `.superpowers/sdd/p25-verify-dropwarn.mjs`（`spawnSync` 三场景：正常 0 告警 /
  半量＝把 fixture 里全部 16 条 `tool` 改成 `tools`（该类目占 items 近半，场景名由此而来），exit 0 且 stderr 出 44%
  告警且写出 18 张 / 归零 exit 1 且 tokens 仍 32）。沙箱只动 `.superpowers/sdd/tmp-seedwarn/` 里的 data+config+fixture
  隔离副本（`scripts/export-seed.mjs:15-19` 全部按 `process.cwd()` 解析路径），仓库 `data/*.json` 三哈希跑前后逐字节不变，
  故这段可复现：`node .superpowers/sdd/p25-verify-dropwarn.mjs`（2026-09-29 主控复跑，三场景数字与上文一致；
  脚本属 gitignored 主控留档，不在仓库内，仓库外的读者请按上文三场景自行构造 fixture）。
- **超两成降幅 → 只出声**：CLI 落盘前调 `dropWarning(base, next, 0.2)`，`console.warn`
  `[seed] 卡片数 32→18（降幅 44%）：若非有意下架，请勿提交——观点字段不可由管线重建，误覆写只能 git 回溯`，
  实测 `exit=0` 且照常写出 18 张。**故意不做硬拦**：决策 Q2 的正常跟随下架必须能跑过去，拦下来反而挡住合法发布。
  阈值语义由 `seed.test.ts`「落盘前降幅告警」例钉住（44%/22% 出声，19%/持平/新增/空基底不出声）。

审查 `data/tokens.json` 变更时的判据：**先看 seed 输出里有没有这行告警**。有告警而提交仍下架了一批卡，
必须在提交信息或 Issue 里写明是哪几张、为什么；没有告警的删除才可能是静默漂移。

# 阶段 E · /admin 认证与数据面验收记录（计划 3）

复跑时刻：2026-09-30 15:56（隔离检出于 `04d7ca5`）与 16:12（隔离检出于 `b0a1cb0`，主控复跑）｜仓库状态：main @ `b0a1cb0`（本文三文件提交所在基线；计划 3 的代码收口态是它的父链 `04d7ca5`）
取证地点：`D:\Documents\code\freeTokenInfo\.superpowers\wt-p3close`（§3 决策 18：主工作树当时携并行窗口**未提交**的数据改动——新增一张小米卡使 8 条钉真实数据的用例转红、`cards` 哈希漂移；六槽改在 `git worktree add --detach` 出的同一 HEAD 隔离检出上实跑，HEAD 态数值与本文期望逐字相符，未改任何判据。该卡落地后 `cards` 哈希与 `out` 页数会**合法换代**，见 §7 第 20 条，复跑者不得当成计划 3 的回归。）
HEAD 换代说明：并行窗口在 15:52:24 提交了 `b0a1cb0`（logo 兜底改中性 `generic.svg`，4 文件 +19/−5：`public/assets/logos/generic.svg`、`scripts/copy-assets.mjs`、`src/lib/copy.ts`、`tests/copy.test.ts`），分支因此从 `04d7ca5` 前进一格；该提交未触碰计划 3 的任何文件，且其对 `tests/copy.test.ts` 的改动是**改写既有一个用例的标题与断言**（`logoFor …` 一条 `it`），未增删用例，故 `Tests 221 / Test Files 27` 不受影响。主控随即把隔离检出 `git checkout --detach` 到 `b0a1cb0` 复跑六槽，结果与 `04d7ca5` 逐字相同（含 `seed:repro` 三哈希与 `out` 页数——那张小米卡至今未提交，故两处检出的受版数据一致），因此本文按**提交所在基线** `b0a1cb0` 记录；复跑者两种取法（`04d7ca5` 或 `b0a1cb0` 的干净检出）都应得到同一组数，直接在被未提交改动污染的 `main` 工作树上跑则会对不上（原因即上一条）。
原则：与计划 2 同口径——凡本机亲测才写「已实测」；一切 GitHub 写操作（Contents PUT、Issue 回执/关闭、workflow 触发）只交付**请求序列与 payload 断言**，真实执行见 docs/ONLINE-STEPS.md §10。本计划不含 UI：四标签页面、样式与状态实触发在计划 4。

## 1. 门禁总览（Step 4 实测）

| 门禁 | 期望 | 实测 |
|---|---|---|
| vitest | `Test Files 27` / `Tests 221`（阶梯 134→140→158→179→206→218→221） | `Test Files  27 passed (27)` / `Tests  221 passed (221)` |
| tsc | `npx tsc --noEmit` 零输出 EXIT=0 | `npx tsc --noEmit` 零输出，`tsc=0` |
| seed:repro | `cards=ba754253ebaa donots=88f99a96da35 rules=7888f2ec168b` | `seed 复现 OK：cards=ba754253ebaa donots=88f99a96da35 rules=7888f2ec168b` |
| build | `✓ Generating static pages (26/26)`（**本计划不新增路由，26 是硬期望**） | `✓ Generating static pages (26/26)` |
| test:out | `pass 5 / fail 0`；`out` HTML 25、`out/intel` 18 | `ℹ pass 5`、`ℹ fail 0`；HTML `25`、intel `18` |
| 泄漏红线（扫描面仅 data 与 out） | 零命中 EXIT=1 | 零命中，`leak=1` |

预期告警基线不变：`[site-config] 未找到卡片： 豆包拉新项目`（`npm run seed` 1 行 / `seed:repro` 3 行）。为消警删 `config/site-config.json` 的键属越界。

### 1b. 整枝终审修复波（2026-09-30 16:42 复跑于**本波提交自身** `bb36790`）

上表记录的是计划 3 七个任务的收口态（`a77144b`，`Tests 221`）。整枝终审在该态上另查出两处「进计划 4 前必修」，本小节记的就是这两处的修复。**测量点写死在 `bb36790` 而不是它的父提交**，原因值得留一句：修复波最初测于「`a77144b` + 五处改动」的未提交态（16:36，`Tests 223`），而并行窗口在那半小时内把分支推进了三格（`2a23bc6` fmtMd 退回、`c842e9b` 区块排序 tie-break、`16b95d2` 注释更正，其中 `tests/{catalog,copy}.test.ts` 各 +1 例）⇒ 我的提交实际落在 `16b95d2` 之上，真实树是 `223 + 2 = 225`。教训：**「与本次提交同一棵树」只能在提交完成后、按实际 SHA 的干净检出上证明**，测在父提交上不算。其余五槽不受并行三提交影响，逐字与收口态相同。

| 门禁 | 修复波期望 | 修复波实测（16:42，`bb36790` 隔离检出） |
|---|---|---|
| vitest | 计划 3 口径净增 `221 → 223`（+1 校验守卫例、+1 传输态例）；实际树再叠并行 +2 ⇒ **225** | `Test Files 27 passed (27)` / `Tests 225 passed (225)`（16:36 于未提交态实测 223，与增量口径吻合） |
| tsc | `EXIT=0` | `tsc=0` |
| seed:repro | 三哈希不得漂移 | `cards=ba754253ebaa donots=88f99a96da35 rules=7888f2ec168b`（逐字同收口态） |
| build | `26/26`（仍不新增路由） | `✓ Generating static pages (26/26)` |
| test:out + 页数 | `pass 5 / fail 0`、`25` / `18` | `ℹ pass 5`、`ℹ fail 0`；HTML `25`、intel `18` |
| 泄漏红线（扫描面仅 data 与 out） | 零命中 EXIT=1 | 零命中，`leak=1` |

两个修复与它们的 RED→GREEN 证据（RED 跑在「`a77144b` + 仅测试」的隔离态，GREEN 复跑地点＝上表的 `bb36790`）：

1. **`crawler/validate.mjs::validateCards` 补「条目必须是对象」守卫**。收口态下非对象条目静默穿透（`"abc".link` → `undefined` → `linkRisk` 不报警 → 校验通过），而计划 3 恰好把审批写面（`publishApprovals` → Contents PUT）直连了生产 `data/tokens.json`，风险面从「Issue 里难看一点」变成「坏形状覆盖生产数据」。新例三条（字符串 / `null` / 数组）在旧实现上报 `expected [Function] to throw an error`，新实现按索引点名（`卡片#1`、`卡片#0：不是对象`）。
2. **`src/lib/admin/pending.ts::loadPending` 补第三态的兜 catch**。头注释承诺 `empty|loaded|error` 三态，但 `await readRepoFile(...)` 在 try 之外，传输层抛错会变成 rejected Promise 上抛——计划 4 的 UI 按三态分流时会整页崩。新例在旧实现上 `Test timed out in 5000ms`（`sleep` 接缝尚不存在 ⇒ 真退避 1s+4s+10s 跑满），补接缝后该例 5ms 完成，断言 `kind:"error"`、`status:0`、原文含 `fetch failed`、hint 含 `api.github.com`、`calls.length===4`（GET 三次退避＝共 4 次请求）。接缝是 `readRepoFile` 透传 `sleep` 给 `gh()`，缺省仍为真计时器＝生产口径不变（与 `auth.ts` 的 `sleep?` 注入同款）。

未随本波改动的终审结论（分诊为「留档不修」或「转计划 4 可验」）逐条见外层计划 §3 决策 19 与 §7 第 21 条。

## 2. 单一实现红线复验（grep 判据）

- 序列化与 UTF-8 base64：`grep -rln "JSON.stringify(value, null, 2)" crawler src scripts` → 仅 `crawler/serialize.mjs`。
- 名单比对与拒绝措辞：`grep -rln "adminLogins" crawler src config` → 实测 **7 个**文件，各自角色：`crawler/allowlist.mjs`（唯一实现：比对 + 措辞）、`crawler/review.mjs`／`src/lib/admin/auth.ts`／`src/lib/admin/publish.ts`（三个入口，都调 `allowlistCheck`/`denyNote`，不写第二句）、`src/lib/admin/config.ts`（读写该键：`parseLogins` 落键 + 非法 login 校验）、`src/lib/types.ts`（`SiteConfig` 字段声明）、`config/site-config.json`（数据）。出现第二处比对逻辑即为回归；比对用的 `toLowerCase()` 归一在全仓只出现在 `crawler/allowlist.mjs:20`。（本行初稿只列了 5 个文件，漏 `auth.ts`/`types.ts` 两处声明与调用，09-30 派发前预检按实测改准——见 §3 决策 18。）
- 盖章语义：`grep -rn "applyDecisions" crawler src scripts` → 定义在 `crawler/approve.mjs:6`，**唯一调用点**是 `crawler/review.mjs:98`；另有两条命中是**注释里的文字引用**（`src/lib/admin/publish.ts:3`、`src/lib/admin/remote.ts:48`），按 §3 决策 17「注释行不计入实现命中」的口径不算第二处调用。`src/lib/admin/publish.ts` 只调 `runReview`（后台与 CI 同源，不存在第二种「批准并发布」）。
- `kind` 口径：`kindLabel`/`isRemoval`/`FIELD_LIMIT` 的**定义**只在 `crawler/diff.mjs`（`:9`/`:15`/`:20`），消费方 **3 处**：`crawler/run.mjs`（Issue 正文）、`crawler/approve.mjs`（`:3` import、`:22/:30` 读 `isRemoval`，自 §3 决策 14 M-1 起）、`src/lib/admin/pending.ts`（后台行）。
- GitHub 读写只在 `crawler/github.mjs`：`grep -rn "https://api.github.com" src` → 零命中（`src/lib/admin/*` 全部经 `readRepoFile`/`writeRepoFile`/`listWorkflowRuns`/`dispatchWorkflow` 出口，带协议的端点基址只存在于 `crawler/`；`tests/admin-trigger.test.ts` 的 URL 断言也 import `API` 常量，不重写基址）。**检式必须带 `https://`**：只搜域名 `api.github.com` 会命中 `src/lib/admin/errors.ts:19` 的 `network` 提示文案「后台需要浏览器能直连 api.github.com」，那是给人读的话、不是端点调用。附带：`grep -rn "crawl.yml" src` → 只落在 `src/lib/admin/runs.ts`（`:11` 的 `RUN_WORKFLOW` 常量与 `:10` 的同名注释，同一处），`trigger.ts` 从它 import，触发与历史盯的是同一个 workflow。
- 构建产物不含 pending/config：`find out -name "changes.json"` → 零命中；`out/` 内不得出现 `site-config.json`。

## 3. 认证与视图状态机（Task 3，假 transport）

`resolveView` 的五态判别联合：`unconfigured`（缺 `oauthClientId`）｜`login`（无会话）｜`denied`（login 不在 `adminLogins`）｜`expired`（token 失效，`/user` 返回 401）｜`ready`。每态由 `tests/admin-auth.test.ts` 的独立用例钉住（共 12 例）；会话只认 `sessionStorage` 注入的 `storage` 与注入的 `now`，模块顶层不碰 `window`/`Date.now()`（静态导出与 SSR-free 的前提，红线 9）。

Device Flow 三段（申请设备码 → 轮询令牌 → 读 `/user` 身份）的全部错误形态在 `tests/github-admin.test.ts` 里以真应答替身覆盖：`authorization_pending` 继续轮询、`slow_down` 按 `interval+5` 退避、`expired_token` 终止、`access_denied` 终止、非 JSON 回调解码（端点在 `Accept` 不满足时回落 urlencoded）。**这些形态按官方文档口径实现，本机未能取证**——出口 IP 对 `api.github.com` 已被限流（见 §7）。

## 4. 运行时数据面（Task 4）

- Contents 读三态：`file`（base64 解回 UTF-8）／`missing`（404＝档案已清，pending 的正常空态）／`error`（带分类 hint）。三态不得合并，否则「读不了」会显示成「一切正常」。
- 错误分因唯一出口 `src/lib/admin/errors.ts`：401→清会话；403 分「限流」与「scope 不足」两句话；404/409/422/5xx/无 status（网络或 CORS）各一支。`isAuthError` 只在 401 为真——把 403 当过期会让人反复重登。**同族的上游修正**：`crawler/github.mjs` 的 `dispatchWorkflow` 原本抛不带 `status` 的 `new Error`，实测进 `classifyError` 得 `kind:"network"`（＝把「token 缺 Actions:write」说成「网络不可达」），本任务改为 `throw await httpError(...)`，改后同一条 403 得 `forbidden` 且 hint 点名 scope（仿真第 0 段两态对照）。
- `loadCurrentData` 用 `Promise.all` 同步进入 transport，故三个 GET 的调用顺序确定，可被请求序列逐字断言。
- `commitText` 的「比对再写」：远端逐字相同 → `unchanged`，不产生纯格式重排的提交；`current` 用 `dump(现值)` 而非远端原文（`data/*.json` 三表 `dump` 稳定已由 Task 1 实测）。
- pending 与 runs 只在运行时 fetch：`PENDING_PATH`/`RUN_WORKFLOW` 常量各一处，产物里不含（§2 判据）。
- **触发爬取（spec §3 的 Tab3 运行态/成功/失败）**：`triggerCrawl` 的确定序列是 `GET,POST,GET`（前置读 runs 取对照 → `workflow_dispatch` → 后置读核对）。GitHub 的 202 **不返回 run 号**，故「成功」的定义是新 run id 出现；`queued:false` 的两种成因（同 id / 后置读失败）都留在 `kind:"ok"` 里，**不折叠成 error**——把已受理的事说成没发生会诱导连点。实测（仿真第 5 段）：前置读 401 时零 POST；POST 得 403 时不再发第三次 GET。
- **效率事实（供计划 4 定 aria-busy）**：后置读撞 5xx 时 `gh()` 的 GET 退避为 1s/4s/10s，整链路实测 **15005ms**（仿真第 5b 段真实计时，非估算）。因此该用例在 vitest 里刻意用 403（即答不重试）覆盖，5xx 只留文档。
- Tab2 的「commit payload 预览」＝ `configPayloadPreview` ＝ `dump(patchSiteConfig(...))`，与真 PUT 的 `content` 解码结果逐字相等（`tests/admin-config.test.ts` 钉）；不存在第二套格式化。

## 5. 审批发布通路（Task 5，含请求序列实证）

`crawler/review.mjs` 是全站唯一「盖章语义」：`parseCommands` → `all` 展开（在 `runReview` 层，非解析层）→ `applyDecisions` → 四件套 `dump` → 回执 → 条件关单 → `commit` 钩子。钩子三条纪律：① 在回执与关单**之后**（不颠倒「先宣布后上线」）；② 只在 `applied` 非空时调用；③ 钩内失败不在本层 try/catch（CLI 保留「写盘失败＝job 红」，后台由 `publishApprovals` 逐文件收着）。`issueNumber` 为 0 时跳过回执与关单、写面照常（无开放审核 Issue 时后台仍可盖章）。

搬迁等价性：`tests/review-apply.test.ts` 既有 7 例一字未改仍然绿（Step 2），新增 4 例只钉钩子与守卫。

`publishApprovals` 结果三态（`denied` / `noop` / `published`）+ 三组文件账（`committed` / `unchanged` / `failed`）。8 例断言的真实请求序列（本机仿真逐条通过，含 fixture 由 `data/*.json` 真实值经 `diffAll` 现场生成，非手搓形状）：

| 场景 | 序列 | committed | unchanged | failed | pendingLeft |
|---|---|---|---|---|---|
| 越权 / 空名单 / 空指令 | 零请求 | — | — | — | — |
| 单条 approve（4 条队列） | `GET,GET,GET,POST,PUT,GET,PUT` | tokens, pending | donots, rules | — | 3 |
| approve all | `GET,GET,GET,POST,PATCH,PUT,PUT,PUT,GET,PUT` | 四件全 | — | — | 0（写回卡表 31 张＝真数据 32 张减末条下架卡） |
| 卡片校验不过（`s.mi.cn`） | `GET,GET,GET` 后抛 | 零写 | — | — | — |
| id 未命中 | `GET,GET,GET,POST` | — | — | — | 4 |
| 第二文件 409 | `GET,GET,GET,POST,PATCH,PUT,PUT,PUT,GET,PUT` | 3 件 | — | donots（hint 带「sha 过期」与「HTTP 409」） | 0 |

两条设计取舍写在这里以免后来者误读为缺陷：① 单文件失败**不中断**后面的文件（失败条目仍留 pending，重试幂等，停在第一个错误只会让剩下的更旧）；② 不设第六个 `kind: "partial"`——`failed.length > 0` 就是部分失败，UI 分支少一条。

## 6. 审批授权面治理（Task 6，裁决 ①）

三重防线：`crawl.yml` review `if` 的第四合取项 `!endsWith(..., '[bot]')`（连 job 都不起）→ CLI 内 `reviewGate` 的 bot 分支（同样静默，防 `endsWith` 语义与预期不符时刷出第二条回执）→ `allowlistCheck` 名单比对（越权者收到 `⛔ 无权限：` 回执且**不合入任何数据**）。名单判定与措辞都复用 `crawler/allowlist.mjs`：review job 的 `if` 表达式与步骤命令体里没有名单、也没有硬编码 login，yml 里唯一出现 `adminLogins` 字样的地方是本节注释对裁决 ① 的**文字引用**（`crawl.yml:50`）。钉＝`tests/workflows.test.ts` 的两条反向断言，分别覆盖 `if` 与 `steps`（§3 决策 17：本句初稿写「yml 里不出现 `adminLogins`」，被 Task 6 Step 4 ① 自己要求写进注释的那句推翻，照贴即字面为假，故改为上述可证形式）。

`reviewGate` 三种结论（`ok` / `skip` / `denied`）由 `tests/review-apply.test.ts` 新增 2 例钉住，含两条容易漏的形态：bot 判定**优先于**名单（空名单下 bot 仍走 skip，不产生拒绝回执）、缺 `TFN_COMMENTER` 走 `denied`（fail-closed）。

**fail-closed 的现行代价**：`config/site-config.json` 目前 `adminLogins: []` ⇒ Issue 评论审批与 `/admin` 两条路都全拒。填名单由「可选」升级为 Day-1 必做（§ONLINE-STEPS 10）。

## 7. 诚实缺口清单（本机不可实证，全部列入线上首查）

1. 本机出口 IP `45.149.92.7` 对 `api.github.com` 已被限流（`HTTP 403 API rate limit exceeded`），Contents / Device Flow / runs 的**真应答形态未取证**，按计划 3 §3 与官方文档口径实现。
2. 浏览器直连 `api.github.com` 的 CORS 行为未验证（静态站点无后端代理，这是 `/admin` 成立的前提）。
3. Actions 表达式 `endsWith` 的大小写与 null 语义未按线上实测（本机无 Actions 运行环境）；`reviewGate` 的 bot 分支是其静默兜底。
4. `review` job 的白名单从**工作树**读配置：若评论产生后 `main` 上的 `adminLogins` 又被改动，本次判定用的是触发提交那一版（§3 决策 4 的已知代价）。
5. 默认 `GITHUB_TOKEN` 的 Contents PUT 是否满足 `/admin` 所需的写权限、以及自动发布闭环所需 PAT `TFN_PUSH_TOKEN`（ONLINE-STEPS §4 方案 A/B）均未真跑。
6. CLI 调用点无 stdout 级断言（沿用计划 2.5 终审复核 Minor ① 的判不修口径：补它需要引入 stdout 桩，属越界）。
7. 端到端真跑（真 token、真 Issue、真 PUT）不在本机执行——用户裁决「线上步骤留出」，红线禁止任何 GitHub 写操作。
8. **`workflow_dispatch` 的 202→run 建立延迟未取证**：`triggerCrawl` 用「后置读是否出现新 run id」判 `queued`，本机只以假应答证实了判定逻辑；真线上若 run 建立慢于 POST 返回（GitHub 无 SLA），首次核对会显示「已受理但未确认」。这是**设计内的保守表述**（不谎报成功），不是故障；计划 4 的 UI 必须在 `queued:false` 时给「稍后刷新」而非「失败」。
9. **Tab2「合作卡增删改」无实现、也不造假实现**：已 grep 核实两处事实——① 首页「合作情报」板块由 `src/lib/catalog.ts:40` 的 `catOf(c) === "项目"` 与 `HomeClient.tsx:73` 的 `c.type === "项目"` 从**卡表**派生，跟 `config/site-config.json` 的 `partners` 键（当前为 `null`）没有关系；② `partners` 全仓无消费者（`applySiteConfig` 不读它），后台写它等于写一份没人读的 JSON。要「增删合作卡」实际是改某张卡的 `category`，而 `PATCH_KEYS` 白名单里没有它、`applySiteConfig` 也不消费 `category`。因此该能力属产品决策（是否允许站长改写分类、以及改了会不会与上游爬取冲突），登记给计划 4 交用户裁决；本计划只在 `SiteConfig`/`patchSiteConfig` 里**原样保留** `partners` 键（`expect(next.partners).toBe(null)` 与键序断言钉住不丢），**不为其造一条假写路径**（红线 4）。

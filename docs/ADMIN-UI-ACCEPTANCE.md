# 阶段 E+ · /admin 四标签 UI 与状态验收记录（计划 5）

原则与计划 2/3 同口径：凡本机亲测才写「已实测」；一切 GitHub 写操作只交付请求序列与 payload 断言，真实执行见 `ONLINE-STEPS.md` §10。本文是 `ADMIN-ACCEPTANCE.md`（计划 3＝认证与数据面）的下游：**数据面已验，本文验的是它铺成界面后的形态与措辞**。编号说明见 §4。

## 1. 门禁总览（2026-10-05 实测于终审修复提交；其前一步为 `ab36c53`，随本次修复 +1 的槽位见 vitest 行的锚定注）

| 槽 | 读数 | 取数命令 |
| --- | --- | --- |
| vitest | `Test Files  41 passed (41)` / `Tests  349 passed (349)`。锚定序列：`347` 钉 `1929b85`（Task 14 Step 0 复跑）；`348` 钉 `2a0dbde`（+1 是 workflows 串行闸例）；`349` 钉本次终审修复（+1 是 ConfigPane 容器首帧例，见 V34/V35 相邻的 I-1 条）。文件数 41 不变 | `npx vitest run` |
| 类型 | `tsc=0` | `npx tsc --noEmit` |
| lint | `lint_rc=0` ＋ 日志尾行原文（`✔ No ESLint warnings or errors`） | `npm run lint > 日志 2>&1; echo "lint_rc=$?"`（**退出码必须由 `$?` 取，管道 `tail` 会吞掉它**；修复前后各一次，见 §5 的 V33 同族条） |
| build 静态页 | `✓ Compiled successfully` ＋ `✓ Generating static pages (27/27)`，`build_rc=0` | `npm run build > 日志 2>&1; echo "build_rc=${PIPESTATUS[0]}"; grep -aE "✓ Generating static pages\|Compiled" 日志` |
| `out` HTML | 26（基线 25 + 1，`+1` 是 `out/admin/index.html`） | `find out -name "*.html" \| wc -l` |
| `out/intel` HTML | 18（**与基线相同**：`/admin/index.html` 不在 `intel/` 子树，本槽不该 +1） | `find out/intel -name "*.html" \| wc -l` |
| 产物红线 | `ℹ pass 9` | `npm run build; npm run seo; npm run test:out` |
| 种子三哈希 | `seed 复现 OK：cards=64e26640c52d donots=88f99a96da35 rules=7888f2ec168b`（**单行**原文） | `npm run seed:repro` |

与计划 3 §1 的旧读数（`Tests 221`、`out` 25、build 26/26）**不回改**：那些值钉的是计划 3 收口态那份数据（§7-20 原话「不是永恒常数」）。本表钉的是终审修复这一棵树。lint 槽有前值可记：修复前（`5dcfae7`）实测 `lint_rc=1` ＋四条 `react-hooks/exhaustive-deps` Warning，修复后 `lint_rc=0`，前后两次取证分别是 `.superpowers/p5-task-14-lint-before.log` / `-after.log`——这条不是「凑绿」，是被 CI 的 quality job 钉住的真回归（见 §5 的 V33 同族条）。

## 2. 十二态矩阵（§7-6「九种逐一真触发」的展开）

原型演示条只有九枚按钮（`未登录/白名单拒绝/token 过期/已登录` + `登录轮询中/待审读取失败/触发失败/历史清空/配置保存失败`），计划 3 §7-6 要求「加上第 2 项共 10 种」。本计划落地 **12 种**，比 §7 的口径多两态，多出的两态不是自创：`noRepo` 是 Task 6 寻址失败必须给的引导态（不给就是白屏），`publishPartial` 是 §7-18 硬性要求的「部分失败/未命中/已发布」三分支之一。逐态判据：

| # | 状态（`STATES[].name`） | 触发方式 | 出口组件 | 文案出口（`uiModel`） | 本机取证 | 线上才能证的部分 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 未登录 | 清 `tfn.admin.session` 后刷新 | `LoginPanel` | `loginCopy(login)` | `tests/admin-shell.test.tsx` 登录侧 | 真 Device Flow 全链（ONLINE-STEPS §10 第 5 条） |
| 2 | 白名单拒绝 | 非白名单身份完成登录 | `DeniedPanel` | `deniedText` + `state.hint` | 同上（假 transport 真序列） | 真 login 与名单的大小写比对 |
| 3 | 凭证过期 | 首屏即过期／在途请求 401 | `LoginPanel` 或黄条＋面板停摆 | `expiredBarText` | `admin-shell`＋`admin-review` 401 出口 | 撤销 token 后的真实 401 时序 |
| 4 | 已登录工作台 | 白名单登录成功 | `Workbench` + 四 pane | `TABS` | `admin-shell.test.tsx` | — |
| 5 | 登录轮询中 | `waitLogin` 在途 | `LoginPanel` 状态条 | `pollingNote(interval)` | `admin-shell.test.tsx` | 真 interval 下的 4003 慢轮 |
| 6 | 待审读取失败 | Contents 读返回 403 | `ReviewPane` 错误条 | `errorBar("pending")` | `admin-review.test.tsx` | CORS 是否放行（§10 第 5 条） |
| 7 | 触发失败 | dispatch 返回 401 | `CrawlPane` 错误条＋清会话 | `triggerReceipt(error)` | `admin-crawl-ui.test.tsx` | 202→run 建立延迟（计划 3 §7 第 8 条缺口） |
| 8 | 历史清空 | runs 应答为空数组 | `HistoryPane` 空态 | `EMPTY_HISTORY`（邮戳「无记录」） | `admin-history-ui.test.tsx` | 首跑前是否真的没有 run |
| 9 | 配置保存失败 | Contents PUT 返回 422 | `ConfigPane` 错误条 | `errorBar("config")` | `admin-config-ui.test.tsx` | 409 并发冲突真形态 |
| 10 | 未配置 OAuth | `oauthClientId` 为空 | `LoginPanel` 引导条 | `loginCopy(unconfigured)` | `tests/admin-bootstrap.test.ts`（**执行期 K6：无 `.tsx`，引导层是纯函数**） | 指向 ONLINE-STEPS §10 第 2 步的文案是否可跟 |
| 11 | 后台寻址失败 | `NEXT_PUBLIC_REPO` 与 `SITE_URL` 都取不到仓 | `LoginPanel` 引导条 | `loginCopy(noRepo)` | `tests/admin-bootstrap.test.ts`（同上） | — |
| 12 | 发布部分失败 | 第二个文件 PUT 抛 409 | `ReviewPane` 回执 | `publishReceipt(failed)` | `admin-review.test.tsx` 盖章 6 例 | 真并发下 `pendingLeft` 漂移 |

矩阵由 `STATES` 生成而非手抄：**核对方式**＝`npx vitest run tests/admin-uimodel.test.ts` 里那条钉 `STATES.length === 12` 与逐态 `copy` 非空的用例仍绿；表内「文案出口」列与 `uiModel.ts` 逐字一致，改文案只会红在那条用例，不会红在这里没人看见。

## 3. 单一实现红线复验（grep 判据，全部本机可跑）

| 判据 | 命令 | 期望 |
| --- | --- | --- |
| 措辞唯一出口 | `grep -rnE '"(稍后刷新\|档案已清\|无记录)' src/app/admin/ \| wc -l` | `0`（只允许在 `src/lib/admin/uiModel.ts`）。**执行期 K5-①**：原命令是不带引号的词面 grep，实测命中 1 处——`PaneAtoms.tsx:47` 的**注释**（那句在解释「这两格要说的是『档案已清 / 无记录』」），照原文判绿=必红；改判「引号形态」后实测 0，而 `uiModel.ts` 内同族文案命中 4 处，判据方向一字未松。同 Task 7 的 C11：注释里的引用不是实现里的分支 |
| 状态条类名 | `grep -rln "adm-statebar" src/app/admin/*.tsx \| sort` | **四文件**：`AdminApp.tsx`、`LoginPanel.tsx`、`PaneAtoms.tsx`、`Workbench.tsx`。**执行期 K5-②**：原文写「恰两文件（`PaneAtoms.tsx`、`AdminApp.tsx`）」是 Task 5/6/7 之后外壳与引导条都用了同一枚状态条类名，实测四文件；这里钉的是「类名不散写为私有前缀」，不是「只有两处」 |
| 错误条原子 | `grep -rln "ErrorNotice" src/app/admin/*.tsx \| sort` | 恰四文件（`ConfigPane.tsx`、`HistoryPane.tsx`、`PaneAtoms.tsx`、`ReviewPane.tsx`）——与撰写期一致，实测确认 |
| 无假 transport | `grep -rn "mkFetch\|fake-fetch\|FakeRes" src/ \| wc -l` | `0`。**执行期 K5-③**：原命令是词面 `mock\|fake`，实测命中 1 处——`AdminApp.tsx:48` 那句红线注释原文「组件与 lib 里不许有 mock 分支」。改为 §1-3 既定的正规形态（假 transport 的三个实名标识符），实测 0。词面判据在「注释里写着不许 mock」的仓里恒假红，正规形态才是有牙的那条 |
| 序列化不重写 | `grep -rn "JSON.stringify" src/app/admin/ \| wc -l` | `0`（pane 层一处都不许出现；序列化只在 `src/lib/admin/` 内——实测命中面是 `pending.ts` 的队列 dump 与 `session.ts` 的会话持久化，`src/app/admin/` 为 0）——原文的 `\| grep -v "preview"` 已无必要（Task 9 的 payload 预览是从 lib 出口取现成串，pane 里没有 `JSON.stringify`），去掉它判据更强且实测仍为 0 |
| hydration 顶层无浏览器对象 | `grep -rnE "(sessionStorage\|window)\.[a-zA-Z]\|Date\.now\(\)" src/lib/admin/*.ts` | **恰 2 处，且都在参数默认值位置**：`auth.ts:50` 与 `auth.ts:123` 的 `now = () => Date.now()`（被调用时才求值，顶层不执行）。**执行期 K5-④**：原命令是词面 `sessionStorage\|Date.now()\|window\.`，实测命中 5 处，其中 3 处是 `session.ts:2` 注释与 `uiModel.ts:20`/`:65` 的**文案**（「清 sessionStorage 后刷新」「token 仅存 sessionStorage」）——文案里出现这个词是要求不是违规。改为成员访问形态后判据仍可复核：顶层零命中、两处均为默认值 |

## 4. 旧编号对照声明（§7-23）

本计划旧称「计划 4」，2026-09-30 17:05 用户裁决改称**计划 5**（逐字：「改叫计划 5，避开并行窗口的计划 4」），落盘文件 `docs/superpowers/plans/2026-09-30-admin-four-tab-ui-and-states.md`。撞车原因与后果由 §7-23 原文记录，此处只解决一个实际问题：**仓内还有 10 处代码/测试注释与旧文档正文若干处写着「计划 4」，它们不改写，怎么读？**（旧文档那侧的行数随换代注自增，本文不作绝对数——依据见下一段。）

普查口径（**终审 I-3 订正，2026-10-05 复测**）：能逐条复算的只有代码/测试那 **10 行**——`grep -rn "计划 4" src tests crawler`，宾语收窄到 `src tests crawler`（不含 `docs`，理由见下）。10 行里，**7 行指本计划**（`src/lib/admin/{auth.ts:35, pending.ts:114, session.ts:21, trigger.ts:8}`、`crawler/allowlist.mjs:25`、`tests/{admin-trigger.test.ts:3, helpers/pending.ts:7}`）、**2 行指并行整改计划**（`src/lib/href.ts:31`、`tests/href.test.ts:55`）、**1 行是本计划自己写的换代注**（`src/lib/admin/trigger.ts:9`，Task 6 落地时加的「2026-09-30 换代注」，它指本计划且已自带解释）。**执行期 K4 校正两处**：① `pending.ts` 的行号撰写期记 `:98`，Task 8/9 在那条通路加代码后已漂到 `:114`；② 原文把第 10 行算作「1 行指代不明（`crawler/openrouter.mjs:1`）」——**该文件不在本分支的树里**（`git ls-files` 无此项；它在主检出是未跟踪文件，见规则 3 的更正），所以 10 行的实际构成是「7 指本计划＋2 指整改＋1 是本计划自己的换代注」，「指代不明」那一支在本任务的取证范围内**无对象**。docs 侧**不作绝对数**（原句「共 19 行」「旧文档 9 行」即错在这里），三条锚定表述各自可复算：① 旧文档正文在撰写期是 9 行（其中 8 行指本计划——`ADMIN-ACCEPTANCE.md` 的 §1 标题下/§1b/§4/§7 第 8、9 条共 7 行 + `ONLINE-STEPS.md:68`；1 行指整改计划——`UI-ACCEPTANCE.md:127`，它写作「计划 4『代码审查发现项修复』」，带计划全名）；② Task 14 Step 7（提交 `2a0dbde`）给 `ADMIN-ACCEPTANCE.md:108` 与 `ONLINE-STEPS.md:70` 追加的两条换代注**自身含字面「计划 4」**，故旧文档入账后为 11 行；③ 若把 `docs` 放进宾语还会命中本文 §4 正文自身 5 行（`:54/:56/:60/:61/:62`），`grep -rn "计划 4" src tests crawler docs` 实测 **26 行**（`grep -rn "计划 4" docs` 实测 16 行，分布＝`ADMIN-ACCEPTANCE.md` 8＋本文 5＋`ONLINE-STEPS.md` 2＋`UI-ACCEPTANCE.md` 1）。⇒ 结论句：**docs 侧随换代注与本文正文自增，不作绝对数；能逐条复算的只有代码/测试那 10 行**。禁令：**不许为凑回 19 去删改代码注释，也不许删本文正文那 5 处引用**——它们是判读规则本身，不是被解释对象。

判读规则（三条，按位置区分，不要按字样统一替换）：

1. **凡指「四标签 UI／`.adm-*` 样式／九种状态实触发／aria-busy 口径／合作卡增删裁决」的「计划 4」＝本文所在的计划 5。** 命中位置：`src/lib/admin/{auth.ts:35, pending.ts:114, session.ts:21, trigger.ts:8, trigger.ts:9}`、`crawler/allowlist.mjs:25`、`tests/{admin-trigger.test.ts:3, helpers/pending.ts:7}`、`docs/ADMIN-ACCEPTANCE.md`（§1 标题下、§1b、§4、§7 第 8/9 条）、`docs/ONLINE-STEPS.md:68`。这些位置**保留原文**——§7-23 明令「历史正文不回改」，且替换成「计划 5」会让当时那条理由读起来指向一个当时还不存在的编号。（`trigger.ts:9` 是 Task 6 落地的换代注本身，它已经是「解释旧编号」的那一句，不属于「被解释对象」，列在这里只因位置在同一条码注释块里。）
2. **凡写作「计划 4 Task N 评审…」「计划 4『代码审查发现项修复』」的＝并行窗口的整改计划** `docs/superpowers/plans/2026-09-30-review-findings-remediation.md`，与本计划无关，**绝对不许动**。命中位置：`src/lib/href.ts:31`、`tests/href.test.ts:55`、`docs/UI-ACCEPTANCE.md:127`。判据是它们带 `Task N`/`评审` 限定词且所指事实（canonical 尾斜杠、`fmtMd`、`rank` tie-break）全在整改计划的任务表里。
3. **指代不明确的保留原样并登记。** 撰写期登记的唯一一处是 `crawler/openrouter.mjs:1` 写「计划 4 追加的第二数据源」。**执行期 K3 复核（2026-10-05 实测，原登记的两条陈述都要更正）**：① 原写「该文件实际随 `3f24146`（计划 3 Task 4 那波）入库」——**错**：`git ls-files crawler` 里没有它，主检出 `git status --short crawler` 打的是 `?? crawler/openrouter.mjs` ＋ `?? crawler/openrouter.d.mts`，即它至今是**未跟踪文件、无提交史**（撰写期大概是在主检出直接看的，把「工作区里有」读成了「已入库」）；② 因此它**不在本分支（`5dcfae7`）的树里**，本任务的任何命令、断言与 `git add` 清单都碰不到它，也**绝不代并行窗口处置它的未跟踪文件**（红线）。登记内容相应改为「归属仍无法从仓内证据判定，且这次连『它是否已入库』都反证为否——判定只能由知道出处的人做，不由本计划代拟」。文档里这一条的实际写法：写明对象当前形态（主检出未跟踪、无提交史）＋待判读，**不得**写成「仓内现行文件」，也不得为了保留规则而把它列进任何核验命令。

## 5. 有意差异登记（相对原型 / 相对计划 3 §7 原文）

规则：凡是「计划文字说的 A，落地成了 B」都必须在这里出现，一条不许漏。分三类：`原型`＝高保真原型与真实数据/实现不符；`§7`＝计划 3 交接清单的口径被更新（含其前提已过期）；`计划 5`＝本计划撰写期在自己内部改的主意。

| # | 类别 | 差异（A → B） | 依据 | 落点 |
| --- | --- | --- | --- | --- |
| V01 | §7 | 用户裁决词 `category` → 仓内实名字段 `type` | 卡表字段实名是 `type`（`HomeClient.tsx:73` 的 `c.type === "项目"`），`category` 只存在于 `splitByCategory` 的派生语义 | Task 2 |
| V02 | §7-8 | 「静态 `public/robots.txt` Disallow + meta robots」→ **只用 meta robots，不加 Disallow** | 并行窗口 `c8f23fc` 已由真实产物生成 `robots.txt`/`sitemap.xml` 并把 `/admin` 排除在 sitemap 外；再手写 Disallow 会在下次 `npm run seo` 时被覆盖，制造「配置会被抹掉」型缺陷 | Task 12 |
| V03 | 原型 | 原型 `#reviewEmpty` 写「解析失败请开审核 Issue」→ 不成立 | `crawler/run.mjs:207-218` 解析失败只 `console.error` + 设 `exitCode`，没有开 Issue 的代码路径；照抄等于给用户一条不存在的出路 | Task 7 |
| V04 | §7-12 | 「UI 层禁止注入假 transport」的执行方式：组件不接 `fetchImpl` 参数 → **pane 自己显式传 `FETCH`** | §7-12 要的是「组件层不得引入 mock 分支」，把 transport 作为 prop 传入反而给 mock 开了后门；默认参数已是 `globalThis.fetch`，pane 内写死 `fetchImpl: FETCH` 既显式又无分支 | Task 7/10/11 |
| V05 | 计划 5 | Task 5 类名口径四处改口：`.adm-kind.del`、`.adm-count .n`、`.adm-card pre`、`.adm-statebar.ok` | 撰写期以 Task 4 实际产出的 class 字符串为准回校 CSS，避免样式选择器与渲染事实各写一份 | Task 5 |
| V06 | 计划 5 | `ChangeRow` 追加 `beforeText`/`afterText` | Tab1 要渲「改前/改后」两栏，`DiffRow` 只有 `kind` 与 `text`，缺前后对照原文 | Task 4/7 |
| V07 | §7-17 | 原文「`PendingJson` 带 `sha`」→ 改为 loaded 支平级 `sha`/`text` + `PublishDeps.pendingCurrent` 必填 | `PendingJson` 是解析后的形状，sha 属于那次读取的元数据，塞进解析结果会让「JSON 里有没有 sha 字段」变成解析器职责；发布侧要的是「当前文件内容＋sha」，平级两件更贴 | Task 8 |
| V08 | 原型 | 原型 Tab2 的「+ 新增合作卡」按钮 → **明确不做** | 新增卡要写进 `data/tokens.json`，那是爬取产物的领地（`applySiteConfig` 不消费卡表新增），后台开这个口子就是造一份会被下次爬取覆盖的假功能（红线 4） | Task 9 |
| V09 | 计划 5 | `badgeClass` → `badgeTone`；`triggerReceipt` 的主语搬进 `ERROR_SUBJECT.crawl` | 前者要避免与 CSS class 字符串混淆（它输出的是语气枚举，不是类名）；后者让「触发失败」四个字只有一份 | Task 4 |
| V10 | §7-9 | 原文预告「会动 `tests/copy.test.ts`」→ 实测**不动它**，动的是 `tests/build-output.test.mjs` | 撰写期 grep 核实 `tests/copy.test.ts` 不含 `privacy`/`contact` 页正文文案的断言，内容页文案的唯一机器断言面是产物测试 | Task 12 |
| V11 | §7-7 | 原文「`build` 26/26→27/27、`out` 25→26」→ 本计划**不改任何数字断言** | 那两个数是 `npm run build` 输出与 HTML 计数，而 `build-output.test.mjs` 用的是下界 23 与 `dirsOf("intel") === 18`，两套口径不同；新值只记进本文 §1，历史读数保留（§7-7 原话） | Task 12 |
| V12 | §7-21 | 原文「只钉次数不钉时长」→ 撰写期实测**已钉 `[1000, 4000]`** | `tests/github.test.ts:8` 已有退避时长断言（并行窗口补的），缺的只是第三个值 `10000`；落点相应改为「补齐第三值」 | Task 13 |
| V13 | §7-21 | 补测暴露一处真实谎报：`gh()` 退避耗尽抛裸 Error（无 `status`）→ `classifyError` 判 `network` → `errorBar` 在 `status===0` 时追加「网络不可达，未发出请求」 | 事实是发了 4 次请求且每次收到 5xx。修复＝`gh()` 记录 `lastStatus` 并在耗尽时挂到抛出的 Error 上（2 行），反向旁证＝`tests/admin-pending.test.ts` 那条用 `mkFetch(new Error(...))` 依赖「无状态」拿 `status===0`，误挂会当场红 | Task 13 |
| V14 | 计划 5 | `PaneAtoms.tsx` 增第三件原子 `ErrorNotice`；Task 7/9/11 三处错误条并干 | 「错误条 + hint + 可选重试」在 Tab1/Tab2/Tab4 同形三现；Tab2 表单期**不给**重试按钮（重新读取会丢掉用户刚填的草稿） | Task 7/9/11 |
| V15 | 计划 5 | `STATES.historyEmpty.copy` 原文「档案已清／无记录」混用两枚邮戳 → 定为「无记录」 | 与 Tab1 空态分家：两格说的不是一件事 | Task 4/11 |
| V16 | 计划 5 | 新建 `src/app/admin/PaneAtoms.tsx`（`ReceiptBar`/`EmptyNotice`/`ErrorNotice`），Task 7 提交文件数 6→7 | V14 的机械结果 | Task 7 |
| V17 | 计划 5 | Task 9 的 payload 预览挂在 `dirty` 上（有改动才渲） | 无改动时预览与线上文件逐字相同，渲出来只是占版面 | Task 9 |
| V18 | 计划 5 | `authFailed` 判据改用既有 `isAuthError` | 401 判据必须与 `auth.ts`/`pending.ts` 同源，另写一份 `status === 401` 会在下次统一口径时漏改 | Task 7 |
| V19 | 计划 5 | `runs.ts` 头注释「Tab3『发布历史』」为事实错误（发布历史是第 4 格）→ 追加带日期更正注，不删原句 | 与 `TABS` 实名（`review/config/crawl/history`）和 Task 5 的 `nth-child(4)` 隐藏档位对齐；更正后 `grep -c "Tab3"` 应为 1 且该行含「2026-09-30 更正」 | Task 11 |
| V20 | §7-11 | **两处配置读取口径不同，属有意为之**（本条为 §7-11 点名的登记义务） | review job 从**工作树磁盘**读 `config/site-config.json`（`deploy.yml`/`crawl.yml` 侧，不发 API 请求，更省往返且不可伪造，代价是新鲜度绑定触发提交）；后台 Tab2 走 **Contents API**（`loadSiteConfig`，要拿 sha 做乐观并发）。同一个键两条读取路径，站长改配置后后台看到的与 workflow 当轮用的可能差一个提交 | §6 交阶段 F |
| V21 | 原型 | 原型开关裸类名 `.sw` → 落地为 `.adm-sw`，几何与配色逐字照原型（本计划执行期 C4） | 裸类名会经 `globals.css` 全站引入而改变前台层叠（与本任务自订的「不补裸工具类」冲突）；且全计划 JSX 无一处 `class="sw"`、Task 9 用的是 `adm-sw`，照抄即死类名；Task 9 旁注原另给一组尺寸，采纳它等于同一控件两份定义，撞红线 1 ⇒ 以原型口径为准、删旁注、Task 9 的 `git add` 去掉 `admin.css`、复核③的提交文件数 7→6。同时第 4 例补一条「顶层类名一律 adm- 前缀」不变量（C5，例数不变） | Task 5/9 |
| V22 | 计划 5 | 阶梯数的下游引用三处漏同步：Task 11 的 `admin-uimodel` 旁证 15→**22**、§2 的示例累计 101→**109**、Task 6/11 两处 Expected 补展开算式（Task 6＝36 files/290 tests，Task 11＝41 files/344 tests） | B2 校正把 Task 4 的用例数由 15 改为 22 时，只同步了 Files 段/Step 5/§5 表/合计/Task 13 五处，**漏扫下游 Task 11 的引用与 §2 的示例累计**（101 是按校正前口径 Task 4＝15、Task 5＝5 累加的）。教训两条：① 改一个阶梯数时普查面必须是「所有引用该数的句子」，做法是 `grep -n` 该数字逐条判归属，不能凭记忆列清单；② Expected 里的「基线 + N」在下游第一次出现时要展开算式，因为累加口径（是否含本任务自身增量）极易口算分歧——本条就是撰写校正块的人自己算错了两次（39/336），回查 §5 表逐行相加才得 41/344 | Task 6/11 |
| V23 | 计划 5 | Task 7 正文里 `admin-uimodel` 的例数仍两处写 **15**（Files 段的 `row()` 工厂说明、Step 里第 696 行那句），是 B2「Task 4 用例 15→22」校正的第二、三处漏同步；已就地改为 22 | V22 记下「改阶梯数要 grep 该数字逐条判归属」的教训，但当时只扫了 Task 11 与 §2 两处就收工——**教训写进台账不等于执行过普查**。本条把普查真正跑完（对计划正文逐条判归属，命中的其余数字均属别的任务或别的量），剩余两处清零 | Task 7 |
| V24 | 计划 5 | **Task 6 的 D4 惰性校正块自带一段错代码**：它给的 `const env = (k: string) => String(process.env[k] ?? "").trim()` 用动态下标读 `process.env`，Next 客户端只内联**字面成员表达式**，动态下标在产物里落到 `process` 垫片（浏览器侧 `env` 为空对象）⇒ 部署后 `bootstrapRepo()` 恒空串，/admin 永久 noRepo，且 SSR 与客户端算出的 `repo` 不一致会引 hydration 分歧。定稿形态＝字面量键 + 函数体（`envRepo()` / `envSiteUrl()`），并删掉无人 import 的 `siteRepo`（Minor-1） | 取证用真实产物而非推理：注入 `NEXT_PUBLIC_SITE_URL` 后构建，admin chunk 里是 `String(null!==(t=I.env[e])&&void 0!==t?t:"").trim()`，而同 chunk 的 `href.ts` 字面访问被内联成 `"https://hope0719.github.io/token-fbi-next/"` 常量——同一次构建、两种命运，差异只在字面与下标。**教训：校正块自己也要过「这段代码在生产环境怎么取值」这一关**；本机 `npm run build` 只证不炸，产物级内联牙交 F8 | Task 6 |
| V25 | 计划 5 | **config 读失败路径给出的是可点但静默无效按钮，并且措辞撒谎**（C7）：外壳 catch 置 `view:"unconfigured"` 而 `config` 仍 `null` ⇒ `clientIdMissing` 为 `false` ⇒ `blocked` 不成立 ⇒ 渲出可点按钮，而 `onStart` 首行 `!config` 早退；同时 `loginCopy("unconfigured")` 的 note 无条件渲在 `adm-meta` 行，把「读不到」说成「缺 oauthClientId」 | 修法两处且不碰判据：① `clientIdMissing={config ? missingClientId(config) : state.view === "unconfigured"}` 把读失败折进第 2 例已钉住的 blocked 形态（禁按钮 + 搬运 `state.hint` 的真实错误），运行不变量变成「按钮可点 ⇔ `onStart` 不早退」；② `uiModel` 的 note 与 `STATES` 台账改覆盖两条来路（该串无测试钉住，全仓 grep 仅命中 `uiModel.ts` 与计划正文，实测确认）。`checking` 期间表达式仍是 `false`，原注释「不能把还没读说成没有」未放松 | Task 6 |
| V26 | 计划 5 | **`ReviewContext.issueNote` 的契约在逐字块里没被兑现**（执行期 C8，评审 Important-1）：简报自订「非空串＝Issue 那条读失败（只改批注措辞，绝不清会话）」，而 `reviewView` 的 list 支只把 `issueNumber` 交给 `approveNote` ⇒ 读失败（403 缺 `Issues:write`，此时 `authFailed` 仍为 false）被渲成「当前没有开放的审核 Issue」，把「没读到」当事实陈述，撞 §0 红线 7 与计划 3 §7-1 | 落地＝`approveNote` 增第二参 `issueNote: string = ""` 并插中间支「读取审核 Issue 失败：原文——这一轮判不出有没有开放 Issue……」，`reviewView` 把 `ctx.issueNote` 递进去；分流第 3 例补 4 条断言（含 `not.toContain("没有开放的审核 Issue")`），§5 累计表的 +19 不变，两处 `approveNote(null)` 既有用例靠默认参零改动。「Issue 侧的回执与关单会跳过」取自实测 `crawler/review.mjs:111-113` 的 `if (issueNumber)` | Task 7 |
| V27 | §7-17（承 V07） | **「队列与快照逐字相同 ⇒ `unchanged`」这一支在本通路不可达**（执行期 C15，主控只读探针实测）：`crawler/review.mjs:122` 是 `if (commit && res.applied.length) await commit(files)`，applied 为空时 commit 不被调用（`unchanged` 连数据表都不填）；applied 非空时队列必少一条，`dump(剩余) !== dump(原)` ⇒ 两个条件互斥。探针三组指令的实测结论逐条登记在 Task 8 Step 1 末尾 | §7-17 要防的「纯格式重排进 git 历史」由**「PUT 携带与队列同一次读的 sha」**承载：同一份内容不会被重复提交（`commitText` 的比对再写仍然生效，只是生效在数据表那一侧），并发下的冲突则如实报 409 而不是被「写前再读一遍」覆盖掉。Task 8 的第二例因此改钉并发 409 形态，不新增 unreachable 断言 | Task 8 |
| V28 | 计划 5 | **`renderToStaticMarkup` 会把文本节点里的双引号转成 `&quot;`，凡按源码字面串断言含引号内容的用例都必红**（执行期 D2）：Tab2 的 payload 预览是 `<pre>{preview}</pre>`，`preview` 含 `"cards"`，实测渲出 `<pre>{\n  &quot;cards&quot;: {}\n}</pre>` | 探针＝`renderToStaticMarkup(createElement("pre", null, JSON.stringify({cards:{}},null,2)))`，`html.includes('"cards"')` 为 false、`includes("&quot;cards&quot;")` 为 true。**判据方向不动**：改的是断言侧（`.replace(/"/g, "&quot;")`），绝不为对上而改 `preview` 的构造。Tab3 的评论正文、Tab4 的 commit message 同样会走这条渲染路径，用例落地时一律先过一遍这个转义再写期望串 | Task 9 |
| V29 | 计划 5 | **Tab2 的两条失败来路必须有两个措辞主体**（执行期 D6）：`ERROR_SUBJECT` 原本只有 `config: "保存失败"`，首屏 `loadSiteConfig` 失败也借它，界面就对没点过保存的人说「保存失败：网络不可达」 | 新增 `configLoad: "配置读取失败"`，读取支用它、写支仍 `config`。取证＝读 uiModel.ts:72 的常量值 ＋ `errorBar` 的第一参类型（:82 `keyof typeof ERROR_SUBJECT`，加键零调用点改动）；`grep -rn ERROR_SUBJECT tests/` 零命中，确认增键不反咬 Task 4 的措辞钉。这与 V25（unconfigured 把「读不到」说成「缺 oauthClientId」）是同一条红线（§0-7）在两处的落点 | Task 9 |
| V30 | 计划 5 | **一条已成功的动作，不能因为它后面的重读失败而被报成失败**（执行期 D14，Task 9 首轮评审 Important）：正文把 `await reload()` 放在 `save()` 的 `try` 内、由同一个 `catch` 报 `errorBar("config", …)`，PUT 已成功却显「保存失败」 | 重读失败一律由 `reload` 自己按读面主体（`configLoad`）上报，写面的 `catch` 只接写面本身；`await reload()` 仍留在 `try` 内以保住 `busy`。**普查面＝Task 10/11**：`CrawlPane`/`HistoryPane` 若也做「动作成功后重读」，同一形态必须成立；评审时对每个 pane 问一句「它的 catch 里有几条来路」。测不到（effect/回调路径），交阶段 F | Task 9/10/11 |
| V31 | 计划 5 | **会 reject 的 `reload` 配裸 `onReload={() => void reload()}` ＝ 静默失败**（执行期 D15，Task 9 修复一轮引入、复审抓出）：`setError(null)` 在起手、`.catch` 只挂在 effect（`booted` 闸保证它不重跑），重试再次失败时清空＋不报错＋列表仍为 null，界面死在加载态——比修复前更坏 | 失败上报收进 `reload` 内部（`try/catch` 自带），三个调用点（effect / `save` / 重读按钮）一律只调不兜；先例＝`ReviewPane.tsx:183-200`（那里的 `reload` 从不 reject）。**写给 Task 10/11 的口径：pane 的 `reload` 要么自己永不 reject（内部 catch 折成态），要么自己负责上报，二者必居其一；裸 `void reload()` 只允许出现在这两者之一成立的地方** | Task 9/10/11 |
| V32 | 计划 5 | **块注释体内抄写字面 cron（或任何「星号紧跟斜杠」的串）会提前闭合注释，其后的文字变成源码正文**——Task 5 的 C1 在 CSS 顶部注释撞过一次并立了 `tests/admin-style.test.ts` 那颗闭合钉，Task 10 实现期在同一族的 TS 块注释里**再次**撞到（在注释体内照抄 `CRAWL_READER_NOTE` 描述的那段 cron 以核对措辞，`*/` 提前闭合 ⇒ `npx tsc --noEmit` 直接语法红）。TS/TSX 面**没有**对应的自动钉（那颗钉只扫 `admin.css`），所以它只靠人守 | 注释体内**不许**出现字面 cron 或任何 `星号+斜杠` 序列；要指涉某个串就引常量名（`CRAWL_READER_NOTE`）或加空格断开（`* ／ *`）。取证＝实现者自曝「一度 tsc 红」；主控复跑 `tsc=0` 且 `grep -c "aria-busy" src/app/admin/CrawlPane.tsx` = 2。**写给 Task 11/12/13/14：任何 TSX/TS/CSS 块注释里引用「每 30 分钟 / 每 6 小时」这类调度描述，一律写中文或引常量，不抄 cron 字面量**。**终审 Q3 裁决补句（把口径写死，免下一轮重复裁决）**：TS/TSX 面**无需专钉**——`next lint` 与 `next build` 都会在 CI 解析 `.ts/.tsx`，块注释被 `*/` 提前闭合后残文成源码 ⇒ 解析或语法错，两步之一必红；CSS 面因为没有解析器才需要 `tests/admin-style.test.ts` 那颗闭合钉 | Task 10/11/12/13/14 |
| V33 | 计划 5 | **任务门禁块漏写数据链后半段**（命令块里有 `build` 却没接 `seo`⇒`test:out`，或没写产物 HTML 页数的 `find out` 取数；Expected 里留「页数 = 基线 + 1」这类简写不展开）——同族漏法到这里已第四次出现：Task 8 的 C19、Task 9 的 D7＋D13、Task 10 的 E3、Task 11 的 F2。成因是撰写期把「跑测试」当门禁、把「产物链」当成 Task 12/14 的事，可 §5 明令每个任务的门禁都要复述三哈希／泄漏／退出码，而 `next build` 会清空 `out/`：漏跑 `seo` 时 `test:out` 必红在「缺 `out/robots.txt`」（Task 1 基线采集实测过一次 `ℹ pass 7 / ℹ fail 1`） | 派发前普查固定加一项：该任务的门禁命令块是否含 `npm run seo`、`npm run test:out`（行首取数用 `^ℹ`，见 D13）与 `find out -name '*.html' \\| wc -l`；缺则补，并把 Expected 的页数简写展开成绝对数（26）。**唯一合法豁免**＝该任务确实不碰产物且写明理由（Task 13 的「`test:out` 不需要重跑，本任务不碰产物」即此形态）。普查面＝Task 12/13/14。**同族第五次漏法（执行期 K10 补进本条，不另开行）**：补了 `build`/`seo`/`test:out`/`find out` 却**没补 `npm run lint`**——Task 9/10/11 落进四个 pane 的 4 条 `react-hooks/exhaustive-deps` Warning 因此一路无人拦（vitest 不跑 lint；`tests/workflows.test.ts` 只钉「`deploy.yml` 执行 `npm run lint`」这条**形态**、并不执行它），而 `--max-warnings=0` 使 quality job 必红。`5dcfae7` 实测 `lint_rc=1`，四条分别 `ConfigPane.tsx:139`、`CrawlPane.tsx:81`、`HistoryPane.tsx:107`、`ReviewPane.tsx:201`。⇒ 计划自 Task 6 起每个门禁块本应含 `npm run lint` 且用 `$?` 取退出码（靠管道尾 `tail` 会把 rc 吞成 0）；已落地部分不回改，缺陷本体由 Task 14 Step 0 修，本文 §1 记修复前后两读数。 | Task 11/12/13/14 |
| V34 | 计划 5 | **四 pane 的「重读」反馈并非同源，属登记的刻意不对称**（终审 I-2，逐 pane 静态可判）：只有 `HistoryPane.tsx:88-99` 的 `read()` 置 `busy`；`CrawlPane.tsx:71`、`ConfigPane.tsx:113`、`ReviewPane.tsx:183` 的 `reload` 都不置；四个 pane 都没有再入/in-flight 守卫，并发 GET 后到者胜，且 History 的 `finally` 会由先返回者提前撤掉反馈 | 裁决＝**本枝不改四 pane 代码**，理由两条：① `busy` 在 Config/Crawl/Review 三面同时禁用别的控件（保存键、开关、盖章键），统一置 busy 会引入没人要求的行为变化；② effect／事件回调路径本机 `renderToStaticMarkup` 够不到，改也无法取证。一致的维度：reject 安全（V31）与读失败措辞（V30）四 pane 齐平。真实点击与连点交阶段 F（见新增 F9），**不得在文档里写成已验证** | Task 9/10/11 |
| V35 | 计划 5 | `TYPE_UNSET`（`（不覆盖）`，下拉 affordance）与 `TYPE_UNSET_META`（`无`，行内 meta 值报告）是**同概念两措辞、单出口**（终审 I-1：两串字面值一字不改，出口收回 `uiModel`，渲染输出逐字不变） | 依据＝本次 I-1 裁决：`TYPE_UNSET` 说的是「选中这一项会发生什么」，行内 meta 说的是「当前覆盖值是什么」，语义角色不同，合并会让紧凑的 meta 行读出括号动作；§1 红线 1 约束的是**出口唯一**，不是**条数唯一**。判读口径沿用 Task 11 已确立的那条——「同常量 ≥2 引用」不算重复实现，「同字面量 ≥2 处各写一遍」才算 | Task 9 |

**同类普查**：V01–V33 是逐条比对原型 HTML、计划 3 §7 原文与本计划正文得出的（**执行期 K1：原写 V01–V20，那是撰写期的表长；V21–V33 全部由执行期入账。表长取锚定表述（终审 I-4 同族订正）：`ab36c53` 树上＝33（`grep -c "^| V"` 当时的读数，有 committed 佐证），本次终审修复入账 V34/V35 后＝35；判据仍取下限 ≥33，绝对值随入账自涨、不作对账常数（与 §5 末段 48/60/62 同口径）**）。为防止「登记漏一条」，另做一次普查——把计划正文里所有「更正」「改为」「不采」「明确不做」字样打出来，与上表条数互校。**路径注记（评审回写）**：下面这条命令的宾语在**外层文档仓**，本仓（`token-fbi-next`）内没有 `docs/superpowers/` 这一层；从本树执行会打到「文件不存在」，`| wc -l` 于是输出 0，会被本段自己的话术误读成「表里有凭记忆的条目」。所以要**在外层仓根**执行，绝对路径 `D:/Documents/code/freeTokenInfo/docs/superpowers/plans/2026-09-30-admin-four-tab-ui-and-states.md`：

```bash
grep -n "更正\|不采\|明确不做\|改为" docs/superpowers/plans/2026-09-30-admin-four-tab-ui-and-states.md | wc -l
```

命中数应 **≥ 33**（与 §5 表行数互校；一处差异常在正文出现两次：动因段＋复核段，所以这个数天然高于表行数）。**这个绝对值是自腐计数，不是达标线，本仓复现不了它**：它随计划正文每次带「更正/改为」字样的入账而上涨，逐笔锚在计划提交上才可复算——外层计划 `660d7e1` ＝ **48**、`29e4108`（K1–K10 校正块入账）＝ **60**、`4d65c63`（本段口径的回写）＝ **62**，三个读数都有 committed 佐证；在工作树上跑只会得到「当下最新值」，那不是常数。⇒ 判据只取下限 ≥33；本文每个读数都带测量时的计划提交号，任何「把 48／60／62 当可复现常数去对账」的读法都是误用本段。命中数**少于 33** 才说明表里有凭记忆的条目、或正文某处改口没写理由；不许反向删表凑数。

## 6. 交阶段 F（本机证不了的事，逐条给验法）

本文所有组件结论都出自 `renderToStaticMarkup` 的**渲染事实**断言——vitest 跑在 node 环境，没有事件循环，所以「点了会怎样」一类交互语义被沉成了纯函数（`tabs.ts` 的键盘 reducer、`uiModel` 的状态映射）。这是本计划的既定取舍（§3 D1/D2），代价是**真浏览器里的行为没有证据**。F 用裸 CDP（Chrome `--headless=new` + websocket-client 连 9333，工具口径见 §7-13）补下面九项（F1–F9）：

| # | 待验事实 | 为什么本机证不了 | 验法与判据 |
| --- | --- | --- | --- |
| F1 | 四标签纯键盘走通（方向键／Home／End／Enter＋Space 激活，roving tabindex） | `renderToStaticMarkup` 不产生事件循环 | 键盘序列脚本，判据＝焦点索引随按键逐格移动，且 `tabpanel` 的 `hidden` 与 `aria-selected` 同步翻转 |
| F2 | 审核开关 `role="switch"` + `aria-checked` 真翻转 | 同上（本文只钉初始渲染事实） | 点击后读 `getAttribute("aria-checked")`，且盖章按钮 `disabled` 随队列空/非空变化 |
| F3 | 899px 断点两档形态（尤其 Tab4 第 4 列「耗时」在小屏隐藏） | 静态渲染无媒体查询 | 两个视口各截图一次，判据＝`getComputedStyle(th[3]).display` 在 ≤899px 为 `none`、否则为 `table-cell` |
| F4 | 凭证过期两支的真时序（首屏即过期＝登录面板；用法中 401＝黄条＋面板停摆） | 真 401 需要真令牌过期或被撤销 | 线上撤销 token 后点一次盖章，判据＝黄条出现且四个面板都不再接受写操作，且 sessionStorage 里的会话被清 |
| F5 | `queued:false` 时给的是「稍后刷新」而不是失败 | 本机只用假应答证实判定逻辑 | 真点一次触发按钮，若 202 后 run 尚未建立，界面文案必须含「稍后刷新」且历史面板可手动重读 |
| F6 | 一次后台发布的多起 review job 与噪声评论（§7-19 / V20） | 本机无任何 GitHub 写操作（红线） | 发布后看 Actions：review job 应为**串行**（第二个排队而非并行），噪声评论作者仍是人类 login（不许为消噪改 bot 身份） |
| F7 | axe 无障碍扫描 | vitest 无 DOM，`tests/admin-style.test.ts` 只扫类名 | axe-core 跑 `/admin/` 零 severe 违规，另用键盘-only 复核焦点可见性（`outline` 未被 `admin.css` 重置掉） |
| F8 | 构建期注入的 `NEXT_PUBLIC_SITE_URL` 是否真进了 /admin 的客户端 chunk（V24 的产物级牙） | 本机与 CI 默认都不注入该变量，内联结果恒为空串，测不出「字面 vs 动态」的差异 | 用 `NEXT_PUBLIC_SITE_URL=https://…/token-fbi-next/ npm run build` 构建一次，判据＝`out/_next/static/chunks/app/admin/page-*.js` 内该仓名字面量命中 ≥ 1 **且** `.env[` 零命中（前者证内联发生、后者证没有残留动态下标）；跑完按常规顺序重建 `out/`（`npm run build` ⇒ `npm run seo` ⇒ `npm run test:out`），别把带私有仓名的产物留作发布物 |
| F9 | 四个面板的「重读」按钮在真浏览器里的反馈与并发行为（V34 登记的不对称） | `renderToStaticMarkup` 无事件循环，`reload` 由 effect/`onClick` 触发，本机够不到 | 裸 CDP 下分别对 Tab1–Tab4 连点两次重读，判据＝①重读期间 `aria-busy="true"` 或按钮 `disabled` 至少其一成立；②两份并发 GET 的响应不得让后到者覆盖先到者之后再由 `finally` 提前撤掉反馈（观察点：`busy` 翻转次数与最终渲染数据来自哪一次响应）；③读失败仍走 `ErrorNotice` 分支而不是空态。结论回写本文档，不在代码里补断言 |

线上侧动作不在本表重复：`ONLINE-STEPS.md` §10 第 1–8 条是 F 的执行清单，`ADMIN-ACCEPTANCE.md` §7 是数据面的诚实缺口。三份文档的分工＝**数据面（计划 3）／界面与措辞（本文）／线上动作（ONLINE-STEPS）**，同一条缺口只在其归属文档里写一次。

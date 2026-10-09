# 计划 6 · 本地增补卡数据面验收记录

验收日期：2026-10-09（本机实测）｜仓库状态：token-fbi-next main @ `fe958b6`（五道闸实测时的仓库 HEAD；本验收记录随本次 docs 提交落库）
后续推进登记（2026-10-10）：全分支评审修复波已在本文之后追加两笔——Wave A 代码提交 `0bebbbe` 与 Wave B 收口提交（即本文所在笔的下一笔，提交号见 §9），新末态读数登记见本文 §9，本文 §1–§8 各行历史读数一律不覆写。
原则：延续 `docs/PIPELINE-ACCEPTANCE.md`——凡本机亲测才写「已实测」；线上（crawl / deploy / 发布）只推演不执行。凡未亲测的格子一律写「未跑（原因）」，不留空、不写推测、不写「应该通过」。
证据文件：本文引用的原始日志全部在外层工作区 `../.superpowers/sdd/2026-10-09-local-cards-data-plane/`（下称 `<工作区>`），文件名随行列出。母本计划里写的 `/tmp/f_*.out` 是占位名，实测一律落工作区，理由是 `/tmp` 在 Windows 侧不跨会话存活。

## 1. 门禁总览（本次 Step 1 实测，四闸 + 工作树）

| 门禁 | 基线（计划 §1 表） | 本计划收口实测 |
|---|---|---|
| `npm run test`（vitest） | `Test Files 50 passed (50)` / `Tests 405 passed (405)`，EXIT=0 | `Test Files 51 passed (51)` / `Tests 425 passed (425)`，**TEST=0**（`<工作区>/gate-t6-test.log:93-94`）。文件数 50→51 的增量是 Task 1 新建的 `tests/local-cards.test.ts`（`git log --diff-filter=A -- tests/local-cards.test.ts` 实测唯一命中 `93b237b`），与计划 §1 末行「基线＋增量 405→414→417→418→423→425」同一口径，见本文 §2 |
| `npx tsc --noEmit` | 无输出，EXIT=0 | 日志 0 字节，**TSC=0**（`gate-t6-tsc.log`） |
| `npm run lint`（`next lint --max-warnings=0`） | `✔ No ESLint warnings or errors`，EXIT=0 | `✔ No ESLint warnings or errors`，**LINT=0**（`gate-t6-lint.log`，逐字同基线） |
| `npm run seed:repro` | `seed 复现 OK：cards=341c45531d3a donots=88f99a96da35 rules=434818f67aac`，EXIT=0（基线即带 3 行 `[site-config] 未找到卡片： 豆包拉新项目` stderr 噪声） | 同一行逐字复现，**REPRO=0**（`gate-t6-repro.log`）。3 行 `[site-config] 未找到卡片： 豆包拉新项目` 噪声照旧——计划 §1 已声明属基线既有噪声、非本计划引入、非验收项 |
| `git status --porcelain -- data config pending tests/fixtures` | 只允许出现 `?? config/local-cards.json`（Task 3 已提交 ⇒ 应为空） | **空输出**（`gate-t6-commits.log` 首段）。全仓 `git status --porcelain` 只剩先于本计划存在的 `?? dist/`，未删未提交 |
| `npm run test:out` | 基线红（镜像口径 vs 主站口径），见计划 §1 表最后一行与 Task 6 Step 2 | **走 A**（同口径重建再判），逐段读数见下面「Step 2 走 A 的五步序列」 |

### Step 2 走 A 的五步序列（产物红线；`out/` 由 `.gitignore:3` 忽略，故任何一步都不进 git 工作树）

| 步 | 命令 | 实测读数 |
|---|---|---|
| ① 重建前复现基线红（镜像 `out/` 是 08:55 的**唯一一份**镜像包，按外层 `../docs/PUBLISH-NOTES.md` 服务端重发被挡，所以这是最后一次能复现基线红的机会） | `npm run test:out > <工作区>/gate-t6-out-baseline.log 2>&1; echo OUT_BASE=$?` | **OUT_BASE=1**，`ℹ tests 14 / ℹ pass 11 / ℹ fail 3`。红的正是计划 §1 `test:out` 行点名的三条口径断言：`✖ 详情页也带台账入口：/intel/openrouter/ 的动作行里有指向台账页的按钮`、`✖ 站内页面链接形态随口径落地：镜像全带 index.html，主站全为 clean URL`、`✖ /admin 已进产物且带 noindex（§7-8）`（`gate-t6-out-baseline.log:11,12,18`）。与基线登记逐字一致，非本计划引入的回归 |
| ② 备份镜像产物到**两仓之外** | `cp -r out "D:/Documents/code/_out-mirror-backup-$(date +%H%M)"`；`find … -type f \| wc -l`；`du -sb` | 备份路径 `D:/Documents/code/_out-mirror-backup-2017`；**149 个文件 / 4665854 字节**；`grep -c noindex out/index.html` = **1**；`out/index.html` 大小 65391、mtime `2026-10-09 08:55:40.292839300 +0800`（`t6-out-backup-stat.txt`） |
| ③ 与 CI 同口径重建（不设 `NEXT_PUBLIC_SITE_ROLE` ⇒ `src/lib/siteRole.ts` 缺省 primary，与 `deploy.yml` 同口径；`npm run build` = `next build && node scripts/subset-fonts.mjs`） | `npm run build > … ; echo BUILD=$?`；`npm run seo > … ; echo SEO=$?`；`npm run test:out > … ; echo OUT=$?` | **BUILD=0**，末段 `✓ Generating static pages (40/40)` ⇒ **N=40**（`gate-t6-build.log:46`）；**SEO=0**，stdout 一行 `[seo] robots.txt 已出（primary）；无 NEXT_PUBLIC_SITE_URL，按本地口径跳过 sitemap`（`gate-t6-seo.log`）；**OUT=0**，`ℹ tests 14 / ℹ pass 14 / ℹ fail 0` ⇒ `pass == tests`、`fail 0`（`gate-t6-out.log:19-22`）。重建后的主站口径产物计数：**149 个文件 / 4647294 字节 / noindex 命中 0**、站内链接形态 `href="/about/"`（`t6-out-primary-stat.txt`）——与镜像口径的 4665854 字节 / noindex 1 形成对照，实证「口径差异而非代码回归」 |
| ④ 还原镜像产物 | `rm -rf out && cp -r "D:/Documents/code/_out-mirror-backup-2017" out`；`diff -r out <备份>` | **RESTORE=0**；`diff -r` **输出 0 行**（`t6-out-restore-diff.log`，实测 0 字节）⇒ 无逐文件内容差异；**退出码当时未单独记录**——Wave B 复核（2026-10-10）：本应复跑 `diff -r out "D:/Documents/code/_out-mirror-backup-2017" > <工作区>/gate-B-diff-r.log; echo DIFF_R=$?` 留独立证据，但该备份目录在两仓之外，自动化会话的执行环境按工作区边界策略拒绝读取（两次尝试均被挡），**`DIFF_R` 读数未获得、`gate-B-diff-r.log` 未产出**。差异清单：无新增证据也无新增差异，「逐字节等价」的现存支撑仍是 ②/④ 的两组计数（149 文件 / 4665854 字节 / noindex=1 逐值相同）＋ `diff -r` 零输出；退出码复跑留给能在该目录同权限环境操作的人按上述命令逐字执行；还原后计数 **149 文件 / 4665854 字节**，与 ② 的两个计数器**逐值相同**（`t6-out-restore-stat.txt` vs `t6-out-backup-stat.txt`） |
| ⑤ 工作树复核 | `git status --porcelain` | 仍只有 `?? dist/`；`git check-ignore -v out/index.html` → `.gitignore:3:out/` ⇒ `out/` 不入库 |

**还原复核**：还原后 `out/index.html` 的 `grep -c noindex` = **1**（镜像口径标志回来）、文件大小 65391 与备份同值、`diff -r` 零差异；mtime 变为 `2026-10-09 20:18:58.169641400 +0800`（原 `08:55:40.292839300`）——`cp -r` 必然改写 mtime，mtime 变化不构成内容差异，内容等价由 `diff -r` 的零输出承担。**这份镜像包仍是待重发的唯一本地副本**（重发被上传通道挡住属服务端问题，见外层 `../docs/PUBLISH-NOTES.md`），本计划未消费、未改动它。

**口径提醒（写给下一个人）**：`tests/build-output.test.mjs` 与 `scripts/gen-seo.mjs` 共用 `roleOf(process.env.NEXT_PUBLIC_SITE_ROLE)` 判定口径，产物按一种口径生成、检查按另一种口径判定，就等于这条自检没有牙（该文件 `:10-11` 的注释原文即此告诫）。本机 `npm run build` 不带 env ⇒ primary 口径，正是 CI `deploy.yml` 的口径；镜像口径需要显式 `NEXT_PUBLIC_SITE_ROLE=mirror` 重建（Git Bash 下用 bash 原生前缀 `VAR=x cmd`，`env VAR=x cmd` 在本机是坏的）。

## 2. 逐任务增量（提交号、用例数、实测来源）

用例数阶梯（计划 §1 末行预期 405→414→417→418→423→425）**逐级命中，零偏差**。中间读数为该任务收尾时的登记值，出处逐行标注；最终态 425 是本次 Step 1 现测。（此句止于收口时点；全分支修复波后的新末态 426 见下表末行与本文 §9。）

| 任务 | 提交（`git log --oneline 2bdc2f4..HEAD`） | 用例数读数 | 读数性质 |
|---|---|---|---|
| Task 1 解析与归一化 | `93b237b` + 修复轮 `554f177` | 405 → **414**（+9），`Test Files 51 passed (51)` | 沿用了 `task-1-report.md:51` 的登记读数（该任务收尾实测）：`Tests 414 passed (414)` |
| Task 2 同名冲突与追加语义 | `a7dc109` + `15a5bb8` | → **417**（+3） | 沿用了 `task-2-report.md:59` 的登记读数：`Tests 417 passed (417)` |
| Task 3 管线接线 | `b708d1f` + `3ce7d8d` | → **418**（+1） | 沿用了 `task-3-report.md:83` 的登记读数：`Tests 418 passed (418)` |
| Task 4 来源对账与等价豁免 | `e7ecb53` + `16ee792` + `0b3269a` | → **423**（+5） | 沿用了 `task-4-report.md:53` 的登记读数：`Tests 423 passed (423)`。`0b3269a` 是注释措辞更正（R-14），`progress.md:136` 登记该笔后仍 `51 files / 423 tests`（③′ 是用例内断言，不是新 `it`） |
| Task 5 展示面与两处文案 | `b35d5fd` + `fe958b6` | → **425**（+2） | 沿用了 `task-5-report.md:62` 的登记读数：`Tests 425 passed (425)` |
| Task 6 收口 | 本次 docs 提交（现号 `82d0d85`，`git rev-list --count 2bdc2f4..82d0d85` 实测 = 12，即 `2bdc2f4..` 之后的第 12 笔） | **425**（零新增用例，本任务不加功能） | 本次现测：`gate-t6-test.log:94` |
| 全分支修复波（Wave A + Wave B） | Wave A `0bebbbe`；Wave B 见 §9 | 425 → **426**（+1 条 `crawlOnce` 落盘行为钉，见母本 §6 判据 7 更正） | Wave A 末态实测（`gate-A-1-final-test.log`：`Test Files 51 passed (51)` / `Tests 426 passed (426)`）＋本波门禁复测（`gate-B-1-test.log`，读数见 §9）。Wave B 只改文档与注释，不新增用例 |

提交数与文件面：`git rev-list --count origin/main..HEAD` 在收口实测时为 **11**（Task 1–5 全部提交，含修复轮），本文档提交后即第 **12** 笔。逐笔 `git log --oneline --name-only 2bdc2f4..HEAD` 全文在 `gate-t6-commits.log`，实测每笔只含该任务 brief 声明的文件：`crawler/local-cards.mjs`、`tests/local-cards.test.ts`、`config/local-cards.json`、`crawler/run.mjs`、`scripts/export-seed.mjs`、`scripts/seed-repro.mjs`、`tests/seed.test.ts`、`src/lib/types.ts`、`src/lib/admin/uiModel.ts`、`src/app/editorial-policy/page.tsx`＋本文件的 `docs/` 一笔。**无越界文件、无 `data/`、无 `dist/`**。

## 3. 计划 §3 勘误的复现证据（原四条 + 全分支评审补录的勘误 5）

复现仪器：`<工作区>/t6-errata-probe.mjs`（只 import `buildSeed`/`dropWarning`/`loadLocal`，argv[1] 不等于 `export-seed.mjs` ⇒ 结构上到不了 CLI 写盘分支；全程内存，**未跑 `npm run seed`**）。输出全文 `gate-t6-errata.log`。

### 勘误 1（`npm run seed` 会毁数据：33 vs 53 与 `dropWarning` 38%）

现测逐字：

```text
[磁盘] data/tokens.json 条数 = 53
[fixture] items 长度 = 36 retired 长度 = 15
[管线] buildSeed(fixture, cfg, loadLocal()) cards = 33
[套件] tests/seed.test.ts:47 期望式 36 - 3 + EXPECTED_LOCAL_IN，本地表条数（=EXPECTED_LOCAL_IN 上界） = 0
[dropWarning] dropWarning(53, 33) 逐字 = 卡片数 53→33（降幅 38%）：若非有意下架，请勿提交——观点字段不可由管线重建，误覆写只能 git 回溯
[dropWarning] 对照组 dropWarning(53, 52)（降幅未过阈值应为 null） = null
```

（Wave B 精度修订：补录 `gate-t6-errata.log:6` 的「[套件]」行——上一版转写时漏了它；日志 `:4` 的 `[site-config] 未找到卡片： 豆包拉新项目` 属 §1 已登记的基线噪声，维持不入本块。补录后本块与 `gate-t6-errata.log:2-8` 除该噪声行外逐行对齐。）

管线侧 33 与磁盘侧 53 的分歧＝计划 §1 表最后一行那 20 张真实上游新增卡（不在冻结 fixture 内）。套件自己的期望式在 `tests/seed.test.ts:47`：`expect(PIPELINE.cards).toHaveLength(36 - 3 + EXPECTED_LOCAL_IN);`——本次实测 `config/local-cards.json` 条数 = 0 ⇒ `EXPECTED_LOCAL_IN = 0` ⇒ 期望 33，与现算 33 相符；聚焦跑 `npx vitest run tests/seed.test.ts` → **EXIT=0**，`Test Files 1 passed (1)` / `Tests 15 passed (15)`（`gate-t6-seed-focus.log:14-15`）。对照行 `dropWarning(53, 52) = null` 证明 38% 那句确由 20% 阈值触发，不是硬编码文案。

### 勘误 2（spec §8 指定的两个落点都不合适，红线改钉 `tests/seed.test.ts`）

无读数，认领依据是两处现状代码逐字：

- `tests/build-output.test.mjs:9` — `if (!existsSync(OUT)) throw new Error("缺 out/：先跑 npm run build 再执行本检查");`。`out/` 缺失即当场 throw（本表 §1 走 A 的 ③ 就是它的正常前置），且该文件是 `.mjs` 走 `node --test`（第 5 行 `import { test } from "node:test"`），复用不了 `src/lib` 的 TS 实现——红线若钉在这里，`data/`↔`config/` 对账要先有产物。
- `tests/hygiene.test.ts:7` — `const SRC = path.resolve(process.cwd(), "src");`。它的扫描面只有 `src/`，与 `data/` + `config/` 的交叉对账无关。

现版落点核对：`tests/seed.test.ts:17` 已在内存现算 `PIPELINE`，「管线↔磁盘等价」在 `:166-193`，「本地增补来源双向对账」在 `:234`——红线确实长在计划指定的家里，本次聚焦跑 15 例全绿即其现状证据。

### 勘误 3（spec §6.3 那句出声文案失真：只记对照）

无复现读数（属文案失真，不是行为失真）。对照：

- spec 原文（外层 `docs/superpowers/specs/2026-10-09-free-model-research-design.md:182`）逐字：`if (warn.length) console.warn("[local-cards] 与上游同名，按 Q2 由上游接管：", warn.join("、"));`
- 落地消费端（`scripts/export-seed.mjs:68`）逐字：`if (warn.length) console.warn("[local-cards] 本地条目未落地（与上游卡或表内前一条同名）：", warn.join("、"));`

改消费端文案而不改 `warn: string[]` 的 API：`mergeLocalCards` 的 `warn` 混装两类冲突名（与上游同名 / 与表内前一条同名），照抄 spec 那句会对第二类打出假因。母本 §3 勘误 3 已标注这是与 spec :182 的有意差异。

### 勘误 4（Task 3 Step 2 的 `hidden` 用例必须展开真 site-config）

三行现测逐字（`gate-t6-errata.log`）：

```text
裸config => THROW 清洗失败（绝不带病入库）：
  WorkBuddy·link：推广短链域名 curl.qcloud.com → https://curl.qcloud.com/8dvDMEyi
  七牛云 AI 推理·link：推广短链域名 s.qiniu.com → https://s.qiniu.com/VV7Zfa
  小米 MiMo（Xiaomi）·link：推广短链域名 s.mi.cn → https://s.mi.cn/NNI4kZp9
展开+hide => OK cards=33 probe=false
展开无hide => OK cards=34 probe=true
```

与 `progress.md:87`（裁决 R-8）登记的三行读数逐字一致：裸 ⇒ `THROW`；展开+hide ⇒ `OK cards=33 probe=false`；展开无 hide ⇒ `OK cards=34 probe=true`。**现测复现，与登记读数逐字一致**。这三行同时是母本 §3 勘误 4 的成立证据：裸 config 走不到 hide 断言就先被 `buildSeed` 在 `applySiteConfig` 之后的逐卡 `linkRisk` 守卫抛出，所以用例必须展开真 `CONFIG` 再叠加 hide，而不是放松守卫。

### 勘误 5（全分支评审收口 I-1 补录：手工塞卡「静默蒸发」的口径失实；文本失真，无复现读数）

勘误 5 更正的是**叙述口径**而非管线行为，没有新的复现仪器；证据是既有代码与本仓既有用例，逐字如下：

- `crawler/run.mjs` 的 `syncOnce` removed 分支（现 :26）：`for (const e of diff.removed) if (e.kind === "card") cards.push(e.before);`——prev 有 next 无的卡按决策 #7 **持旧值保留在 `data/tokens.json` 尾部继续展示**，同时进 `pending/changes.json` 并开审核 Issue；
- `crawler/approve.mjs` 的 `applyDecisions`：:27 approve removal 才 `nextCards = nextCards.filter((c) => c.name !== e.name);`，:41 reject 维持现库值（注释逐字「reject：维持现库值不动——修改/删除在持旧期本就不生效」）；
- 本仓用例 `tests/run.test.ts:62-74`「删除卡：卡片保留在 data 尾部（待审期间照常展示），pending after=null」断言 `toEqual(["留卡D","删卡C"])`，钉的正是这个行为。

据此，母本 §3 勘误 5 与 spec §10 复核记第 10 条把旧写法（「既不报红也不留痕」「静默蒸发/静默覆盖/静默抹掉」一族——此处仅作**引用原话**登记，不是断言）更正为真话：塞卡不进管线产物（`adapt.mjs:49` 对 `adaptItems` 局部为真），但端到端命运是**判「上游已删除」→ 挂 pending 留痕 → 持旧值留库尾照常展示**，`/approve` 出局、`/reject` 长驻。活文本落点（实施面 `0bebbbe` 三处、文档面本波五处）逐一点名见 §9；`crawler/adapt.mjs:49` 注释本身**不改**，它也**不是**错的。

## 4. 有牙检查（断言真的会咬人，不是空转）

| 演练 | 读数 | 性质 |
|---|---|---|
| Task 4 Step 8 来源对账四行（纯内存 `buildSeed`） | `管线标记 = [ '探针牙' ]` / `名单外贴标应报违规 = 1` / `名单内干净应为空 = 0` / `漏 sourceUrl 应报 = 1` | 沿用了 `task-4-report.md:41-46` 的登记读数（Task 4 收尾实测），四行与 Expected `['探针牙'] / 1 / 0 / 1` 相符 |
| Task 5 Step 2 的两条红（先红后绿） | `Test Files 1 failed (1)` / `Tests 2 failed \| 16 passed (18)`；FAIL 名：`⑰ 「精选门槛与收录标准」页公示了本地增补卡的核验日来自本站（spec §6.4）`、`⑱ 后台的新增卡说明改指 config/local-cards.json，不再教人手工改 data/tokens.json` | 沿用了 `<工作区>/gate-t5-red.log:13,65,81-82` 的登记读数（Task 5 红灯阶段实测）。同一批用例在本次收口实测中随全量 425 例转绿（TEST=0），说明红→绿是代码跟上而非放宽判据 |
| R-14 并集口径的措辞探针（五处判定） | `[条数]33 vs 34 红 / [①]["Qoder cn"] 红 / [②][] 绿 / [③][] 绿 / [对账]["Qoder cn"] vs [] 红`，`unionSize=51 / remapSize=50` | 沿用了 `progress.md:136` 的登记读数（Task 4 修复轮 1 期间实测，仪器 `probe-r14-wording.mjs`）。它同时更正了 R-14 原句：并集口径下报红的是**条数＋①＋双向对账**三处，**② 反而不报**（母本 `318d0b5` 与代码注释 `tests/seed.test.ts:25` 已同步） |
| 勘误 4 的 `hidden` 用例空转排除 | `PIPELINE.cards.length = 33` / `merged.cards.length = 34` / `hidden.cards.length = 0` / `hidden.cards.some(探针) = false （原 some 断言 toBe(false) 在此场景仍 PASS＝空转）` / `长度钉是否转红？ 红（有牙）` | 沿用 `<工作区>/task3-fixround1-teeth-drill.out` 的登记读数（Task 3 修复轮 1 实测）。结论：`some()` 单独不足证，长度钉 `toHaveLength(PIPELINE.cards.length)`（`tests/seed.test.ts:226`）才是那颗牙 |
| 本次新增：`dropWarning` 阈值对照 | `dropWarning(53, 33)` 出文案、`dropWarning(53, 52)` 出 `null` | 本次现测（`gate-t6-errata.log`）：降幅告警按阈值走，不是无条件喊话 |

## 5. 本计划未做（交接清单，顺序即用户裁决的执行顺序）

逐条照母本 §7，六项全部未执行（本计划只交付机制）：

1. **调研执行**（spec §3 取材面四类 + §4 四条硬标准）：覆盖矩阵无未决格，长尾三类门槛不降，拿不到一手证据就落待核。
2. **报告** `docs/research/2026-10-09-free-ai-quota-scan.md`（spec §7 八段结构），含 §5 存量活动时效核查（10/53 + 7 + 1 三档读数的逐条四态判定与处置映射）。
3. **停下等用户逐条批**（用户原话：「不要直接执行，等我把报告看完再决定」）。批准后：往 `config/local-cards.json` 追加条目（`updated`/`checkedAt` 用 UTC+8 核验日，`sourceUrl` 写额度原文所在页），提交内层仓库；**本地不跑 seed**，等 `crawl.yml` 那一轮把卡写进 `data/tokens.json`（D-4）——**回指上游 sha 门（Wave B I-2，登记在 `crawler/run.mjs` 短路处注释与 `docs/ONLINE-STEPS.md` §12.1）**：`meta.lastSyncedSha` 与上游最新 commit 相同则整轮短路、连 `buildSeed` 都不调用，`workflow_dispatch` 手工触发同样被短路；上游停更期增补卡会长期停在 config 里不落盘，只能等上游产出新 commit（强制落地机制需用户另批，母本 §7）。若某条链接要用本站活动码，按 D-3 把码值加进 `clean.mjs:42` 的 `OWN_INVITE_CODES`。
4. **时效处置落地**（spec §5 四档：hide / 加注观点字段 / 降级 donots / 不动）。改前先看版面（spec §9.4：`docs/PUBLISH-NOTES.md` 已知限制 1 的精选区固定卡序硬编码）。
5. **发布**：走既有发布前置四条（含剥注释等，见项目记忆「旧站码值注释已公开 + dist 双语义撞车」），另行请批；`test:out` 必须与构建同口径（Task 6 Step 2）。**本次未发布**（裁决「本次不发布」）。
6. ~~若 Task 6 走了 B（未跑产物红线），下一次带 `NEXT_PUBLIC_SITE_ROLE` 的 CI 实跑要回来补 §6 完成判据第 2 条的产物面读数~~ —— **本计划走的是 A，产物红线已实跑**（见 §1 表末行与五步序列）。仍建议留给 CI 的一条是：镜像口径（`NEXT_PUBLIC_SITE_ROLE=mirror`）下的产物面本机未跑，本机只验了 CI 的 primary 口径。

另两条必须点名的「有意不做」：

- **③′ 并集自检有牙的前提是跨文件钉（R-15）**：`tests/seed.test.ts:185` 的 ③′ 并集自检之所以咬得住「把本地卡登记成上游原名」，依赖 `tests/adapt.test.ts:50` 逐字钉住别名表 `expect(NAME_ALIAS).toEqual({ "Qoder cn": "阿里云 Qoder（灵码）" });`（本次实测该行仍在原处原文）。这是**测试之间的隐式耦合**：将来若 `NAME_ALIAS` 增删条目，`adapt.test.ts:50` 会先红，而 `seed.test.ts` 的并集口径随之改变——改表时必须同时复核 ③′，不能只改一处。
- **「按别名挡同名卡」的生产侧拦截未实现**：`mergeLocalCards` 只按**字面名**判同名（本地条目名 ∈ 上游卡名 ⇒ 让路）。一张卡若以别名形态存在于上游、本地表写它的原名，生产侧不会挡，只有测试侧的并集口径（条数＋①＋双向对账三处，② 不报）会报红。这是裁决 R-14 的既定取舍：检测面收在测试侧，不在 crawl 链路上加第二套语义；`318d0b5` 已把「②′ 报红」的失实措辞在母本与代码注释里同步更正。

## 6. 完成判据逐条勾回（判据 1–8；本表是收口读数的唯一出处）

| # | 判据命令 | 实测读数 | 判定 |
|---|---|---|---|
| 1 | `npm run test` | `TEST=0`；`Test Files 51 passed (51)`、`Tests 425 passed (425)`（`gate-t6-test.log:93-94`） | ✅ 425 与「405 + 20」相符 |
| 2 | `npx tsc --noEmit`；`npm run lint`；`npm run seed:repro` | `TSC=0`（日志 0 字节）；`LINT=0`＋`✔ No ESLint warnings or errors`；`REPRO=0`＋`seed 复现 OK：cards=341c45531d3a donots=88f99a96da35 rules=434818f67aac` | ✅ 三闸 EXIT=0 且三哈希与 §1 基线逐字相同（空表零扰动） |
| 3 | `git status --porcelain -- data pending tests/fixtures`；`git diff --name-only 2bdc2f4 HEAD -- data` | 前者**空输出**（`gate-t6-commits.log`）；后者**空输出**（0 行，`git diff --name-only 2bdc2f4 HEAD -- data \| wc -l` = 0） | ✅ `data/` 在本计划 11 笔提交里零改动 |
| 4 | `grep -c "手工改 data/tokens.json" src/lib/admin/uiModel.ts`；`grep -c "本地增补卡" src/app/editorial-policy/page.tsx` | 前者 **0**（grep 无命中时自身退出码 1，判据要的正是 0 命中）；后者 **1**（退出码 0） | ✅ 旧口径教学语句已清；收录口径页已公示本地增补卡 |
| 5 | `node -e "console.log(require('./config/local-cards.json').length)"` | **0** | ✅ 首批为空表，等报告获批（计划 §7 交接清单 3） |
| 6 | `grep -n "mergeLocalCards" scripts/export-seed.mjs` | 命中 2 行：`15:import { loadLocalCards, mergeLocalCards } from "../crawler/local-cards.mjs";` 与 `67:  const { cards: withLocal, warn } = mergeLocalCards(cleaned, (local \|\| {}).localCards \|\| []);`。顺序肉眼核对：`:62` 是 `const cleaned = adaptItems(items, prevCards).map(cleanCard);`，`:79` 是 `const merged = applySiteConfig(withLocal, prevDonots, config);` ⇒ 调用行 **67 落在两者之间** | ✅ 合并点「位置即语义」成立：hide/link/type 覆盖与之后的逐卡 `linkRisk` 对两类卡一视同仁 |
| 7 | `grep -c "localCards" scripts/export-seed.mjs`；`grep -c "localCards" crawler/run.mjs`；`grep -c "\.\.\.local," scripts/seed-repro.mjs`（三条**逐个单独跑**，不合并） | **2**（≥2）/ **3**（≥1）/ **1**（≥1），三条退出码均 0（`gate-t6-judge7.log`） | ✅ 三个取数口全部接线：`loadLocal` 返回键＋合并点消费 / `crawl` 的 `prev` / 复现闸第三跑透传 |
| 8 | 内层 `git rev-parse origin/main`；内层 `git rev-list --count origin/main..HEAD`；内层 `git reflog show origin/main`；外层 `git remote -v`；外层 `git rev-parse --verify origin/main` | 内层 `origin/main` = `2bdc2f44644a6d1f415a69e35c284e2542ffeaa6`（＝本计划 BASE ⇒ 远端一步未前进）；`rev-list --count` = **11**（Task 1–5；本文档为第 12 笔）；reflog 首条（最近）= `2bdc2f4 refs/remotes/origin/main@{0}: update by push`，本计划 11 个提交号（Wave B 精度修订：不写「`93b237b`…`fe958b6`」这种区间省略式——它不锁数量。改为显式口径：`git log --oneline 2bdc2f4..fe958b6` 输出共 **11 行**，首行 `fe958b6`、末行 `93b237b`，`git rev-list --count 2bdc2f4..fe958b6` 于 Wave B 复测 = 11，全清单见 `gate-t6-commits.log`）在该 reflog 里**命中数逐个为 0**；外层 `git remote -v` **空输出**（退出码 0）；外层 `git rev-parse --verify origin/main` → `fatal: Needed a single revision`（退出码 128）。取证全文 `gate-t6-judge8-inner.log` / `gate-t6-judge8-outer.log` / `t6-origin-reflog.txt` | ✅ 未 push 成立。`make-dist` 未跑：`dist/` 的 mtime 实测 `2026-10-05 14:03:13.618536500 +0800`，早于本计划开工日（2026-10-09），且它全程只是 `git status --porcelain` 里唯一那条 `?? dist/`——本次既未重建它，也未删除或提交它；`publish` 未跑：本会话未执行任何发布类命令，属裁决「本次不发布」 |

判据 8 的最后一句复述一遍纪律：任何一条对不上 ⇒ 当作事故停下上报，不得就地补一步「补救性 push」。本次八条全部对得上，零补救动作。

## 7. 诚实缺口清单（本计划范围内未跑的部分）

| 未跑项 | 原因 |
|---|---|
| 镜像口径（`NEXT_PUBLIC_SITE_ROLE=mirror`）下的 `npm run build && npm run seo && npm run test:out` | 走 A 的口径必须与 CI `deploy.yml` 一致才能零歧义判定，本机本次只做 primary。镜像产物本次只做**备份与逐字节还原**，未重建；镜像口径的产物面读数留给下一次带 env 的 CI 实跑（§5 第 6 项） |
| `npm run seed`、`make-dist`、`git push`、publish 类命令 | 红线：`npm run seed` 会覆写 `data/`（§3 勘误 1 已现测 33 vs 53 的后果）；`make-dist`／push／publish 属裁决「本次不发布」，且 push 是真实可走的不可逆路径 |
| 线上 crawl / deploy / Issue 审核链路 | 属线上步骤，本机只推演不执行（延续 `docs/PIPELINE-ACCEPTANCE.md` 同一原则），交付面见 `docs/ONLINE-STEPS.md` |
| `config/local-cards.json` 首批真实条目 | 等报告逐条获批（§5 交接清单 1–3），首批为空表是设计交付形态，不是缺口 |
| `[site-config] 未找到卡片： 豆包拉新项目` 3 行噪声 | 计划 §1 已声明属基线既有噪声（`config/site-config.json` 的孤儿键），非本计划引入、非本计划验收项，未修 |

## 8. Step 3 空表零扰动现测 + 与 brief 的两处执行偏离

空表零扰动复核（Step 3 三条命令的实测读数，机制上线的影响面）：

```text
seed 复现 OK：cards=341c45531d3a donots=88f99a96da35 rules=434818f67aac   ← 与 §1 基线行逐字相同（gate-t6-repro-line.log，REPRO2=0）
PIPELINE.cards len= 33 sha16= 341c45531d3ab41e                            ← 内存 buildSeed + loadLocal()（gate-t6-memseed.log，MEM=0）
local 标记数= 0                                                            ← 空表 ⇒ 产物里没有任何 origin==="local" 的卡
0995124 fix(workbuddy): 「立即领取」改挂本站活动邀请链接，入库闸按码值开一条自有码豁免   ← git log --oneline -1 -- data/tokens.json data/meta.json
```

`data/` 最近一笔提交 `0995124`（2026-10-06）实测是先于本计划 BASE `2bdc2f4` 的祖先（`git merge-base --is-ancestor 0995124 2bdc2f4` 退出码 0），本计划 12 笔无一触碰 `data/`。

与 brief 的两处执行偏离（如实登记，均不影响判定）：

1. **Step 3 的内存探针**：brief 的代码片段含 `seed.cards.filter((c:any)=>c.origin==='local')`，`:any` 是 TypeScript 语法，在 `node --input-type=module -e` 下必然 `SyntaxError`。实测时去掉类型注解写作 `(c) => c.origin === "local"`，其余逐字照抄。读数不受影响：`local 标记数= 0`。
2. **Step 2 的汇总行取数形态**：brief 用 `grep -E "^# (tests|pass|fail)"`，本机 `node --test` 走 spec reporter，汇总行形态是 `ℹ tests 14` / `ℹ pass 14` / `ℹ fail 0`（无 `# ` 前缀），该 grep **零命中**（本次实跑该 grep 得 `No matches found`）。本次按 `ℹ` 形态取数并按判据本意核对 `pass == tests`、`fail 0`，不改变判定。

## 9. 全分支评审修复波（Wave A + Wave B，2026-10-10 登记）

评审对象是计划 6 全分支（`git rev-list --count 2bdc2f4..82d0d85` = 12 笔，本文 `82d0d85` 为其末笔；评审后叠加 Wave A `0bebbbe`，`2bdc2f4..0bebbbe` = 13 笔）。两波收口：

- **Wave A（代码/测试/文案）＝ `0bebbbe`**（6 文件，+84/−13）：公示文案改真话（承母本 §3 勘误 5，实施面三处：`src/lib/admin/uiModel.ts` 的 `ADD_CARD_NOTE` 与注释块、`crawler/local-cards.mjs` 模块头与 `loadLocalCards` 注释）；`tests/seed.test.ts` ①′ 逐字对账基准收窄（承 D-7：只比磁盘副本自身 `origin === "local"` 者）；`tests/run.test.ts:141-176` 新增 `crawlOnce` 落盘行为钉（425→426，母本 §6 判据 7 已按实况更正「grep 是接线哨兵非行为断言；`run.mjs` CLI `main()` 读盘传参那一行无测试覆盖」）；`crawler/local-cards.mjs` 的 `linkRisk` sourceUrl 引流红线（用例 ⑮ 内行为断言）；本地表读盘移进 try（M-2）；VIEW_KEYS 跨文件约定注释（M-5）。报告与有牙演练：`wave-A-report.md`（drill-A4/A5 红→还原→绿闭环）。
- **Wave B（文档收口＋一处纯注释）＝ 本文所在笔**（外层配套笔＝docs 提交后的外层最新一笔）：`crawler/run.mjs` sha 短路处 I-2 注释（纯注释，登记「上游停更期本地表长期不落地」与另批口径）；母本 §3 勘误 5 / §2 D-7 / §6 判据 1（期望 426）与判据 7 更正 / §7 交接 7；spec §2.2–§2.3 改真话＋§10 复核记 10；本文 §1④/§2/§3/§5/§6 的精度修订；`docs/ONLINE-STEPS.md` 新增 §12（三条时间线／crawl 停摆先查本地表／通知 Issue 口径失真登记）。

**本波六条门禁复测逐字读数**（日志 `gate-B-*.log`）：`npm run test` → `Test Files 51 passed (51)` / `Tests 426 passed (426)`，TEST=0（`gate-B-1-test.log:96-97`，Wave B 不新增用例）；`npx tsc --noEmit` → TSC=0（日志空）；`npm run lint` → LINT=0；`npm run seed:repro` → REPRO=0，`gate-B-4-seedrepro.log:8` 逐字 `seed 复现 OK：cards=341c45531d3a donots=88f99a96da35 rules=434818f67aac`——三哈希与本计划基线**逐字不变**；`git status --porcelain -- data pending tests/fixtures out` → 空；末态 `git status --porcelain` → 仅 `?? dist/`。判据 7 三条 grep（逐个单跑）：`localCards` 在 `scripts/export-seed.mjs` = 2、在 `crawler/run.mjs` = **3**（与收口时读数相同——Wave B 的 I-2 注释用的是 `config/local-cards.json` 连字符形态，不增删驼峰命中）、`...local,` 在 `scripts/seed-repro.mjs` = 1。

**失实措辞普查（B3，改前→改后，命令逐字 `grep -rn "静默蒸发|静默覆盖|既不报红也不留痕|静默抹掉"` 覆盖 `docs`＋`token-fbi-next/{docs,src,crawler,scripts}`）**：改前 **8 处**：母本 6（:5/:264/:265/:352/:1080/:1082，断言）、spec 1（:38，断言）、`2026-09-30-review-findings-remediation.md:483` 1（另一机制的断言，与本波无关，不动）；`token-fbi-next` 侧 0（Wave A 已改净）。改后共 **9 处，全部不是新断言**：母本勘误 5 内 4（含该条普查命令的模式串）＋spec 复核记 10 内 1＋本文 3（§3 勘误 5 小节 2 处原话引用＋本段命令模式串 1 处——本段自身即 +1 的来源）＋remediation :483 1（原样未动）。断言面：改前 7 → 改后 **0**，无失实断言保留。

**`diff -r` 独立复跑**：被本会话的执行环境按工作区边界策略拒绝（备份目录在两仓之外），`DIFF_R` 读数未获得——已在 §1 ④ 行如实登记并留下可逐字复跑的命令行，不改动「还原等价」的既有证据链（文件/字节/noindex 三计数）。

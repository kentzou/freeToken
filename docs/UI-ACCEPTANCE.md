# Token 情报局（token-fbi-next）计划 1 · UI 全量验收记录

验收日期：2026-09-29（本机实测）｜仓库状态：main @ `d84816b` + 本次 Task 11 提交
本文所有数字均来自本机命令输出或浏览器实测；凡未亲测的项一律标注「未实测」及原因，供计划 2/3 作基线。

## 1. 门禁命令与输出摘要（本任务实测）

| 门禁 | 命令 | 结果 | exit |
|---|---|---|---|
| 全新构建 | `npm run build` | `seed 完成：tokens=39 donots=22`；`assets 完成：34 个 logo`；`✓ Generating static pages (28/28)`；首页 7.65 kB / First Load 95.1 kB | 0 |
| 产物红线 | `node --test tests/build-output.test.mjs` | `# pass 5 / # fail 0`（5 项全过，见 §2 偏差注记） | 0 |
| 单测全量 | `npx vitest run` | `Test Files 7 passed (7)`，`Tests 71 passed (71)`（theme 5 + seed 8 + clean 23 + catalog 9 + copy 13 + extract 10 + href 3） | 0 |
| 类型 | `npx tsc --noEmit` | 无输出 | 0 |

以上四命令均直跑，未经 head/tail 管道（避免吞退出码）。构建产生的 `data/meta.json` 时间戳 churn 在暂存前 `git checkout --` 还原，未混入提交。

## 2. 数据来源与条数（可复现）

- 来源：镜像 `../token-fbi/app.js` → `extractStructures` → `cleanCard`/`applySiteConfig` → `linkRisk` 校验入库；`meta.json` 实测 `counts = { tokens: 39, donots: 22 }`，`lastSyncedSha: null`（本地种子），`sourceFingerprint: 7f8c5cb80c9138c4`，`lastSyncedAt` 为 2026-09-29。
- 可见集：**20**（`catalog.test.ts` 断言 + 首页 SSR 实测「找到 20 条情报」）。
- 区块计数（本次 `out/index.html` SSR chip 实测，与 Task 9 dev 浏览器实测一致）：全部 20 · 大模型 **8** · 编程工具 **12** · 限时 **4**（生产力 10 / 图像 7 / 语音 1 / 数据 3 / 平台 11 为标签维度，可与类型交叉）。
- 产物数量（本次实测）：`out/` HTML 共 **27** 个 = 首页 + **20** 个详情页目录（`ls out/intel | wc -l` = 20）+ 4 内容页 + `404.html` + `404/index.html`；构建路由表另列 `/_not-found`（复用 404 产物）。
- **红线脚本与 brief 的唯一偏差（已在代码注释固化）**：引流检查正则 `invite_code` 补为 `invite_code=`。原因：`editorial-policy` 页按规范逐字公示五个清洗参数名（`<code>invite_code</code>`，Task 10 brief 明令保留），无等号的裸词造成误报；真实引流痕迹恒为 `?invite_code=<码>` 查询串形态，补等号后全量产物仍扫描、检出能力不降。已验证：`grep -rlE "userCode=|invite_code=" out --include='*.html'` = **0** 个文件；裸词 `invite_code` 仅出现在 editorial-policy 一处（即公示页）。

## 3. 清洗证据

### 3.1 逐卡普查表（Task 4/5 实测原值 → 处置，13 条，收录于 Task 5 brief Step 1）

| 卡片 | 上游原值（实测） | 处置 |
|---|---|---|
| 阶跃星辰 StepFun | `platform.stepfun.com` + `inviteBase` 3 条码池 | 配 link → 自动清池 |
| 阿里云 Qoder（灵码） | `?userCode=ygtxup80` | 正则已剥；link 兜底幂等 |
| WorkBuddy | `curl.qcloud.com/8dvDMEyi`（腾讯云推广短链） | → `hunyuan.tencent.com/` |
| B.AI（AI 模型聚合平台） | `?invite_code=CQLBPC` | 正则已剥；观望名单同名卡靠这里同步覆盖 |
| 秒哒（百度） | `?invitecode=user-7a0wz6474m4k` | 正则已剥 |
| LobsterAI 有道龙虾 | `#/index?keyfrom=invitation`（hash 内） | 正则已剥；此处兜底 |
| 云工开物学生专区 | `?clubTaskBiz=…&userCode=…`，路径仍是 `/course/promotion28-activity` | → 活动站根 `university.aliyun.com/` |
| 豆包拉新项目 | `link:"#"`，网盘拉新广告（扫码加原作者微信） | `hide:true` |
| 太行HUB（token.taiha.cn） | `?aff=Ox6S`（观望名单） | 正则已剥 |
| 七牛云 AI 推理 | `s.qiniu.com/VV7Zfa`（短链，情报卡与观望名单各一处） | → `portal.qiniu.com/ai-inference/api-key` |
| GLM-5.3-Flash（Ox-Alpha） | `bigmodel.cn/activity/trial-card/PU9MTWG0PM`（码在路径） | → `bigmodel.cn/`（只截到站点根，不猜活动页） |
| 硅基流动 SiliconFlow | `cloud.siliconflow.cn/i/HgdEna2e`（`/i/<码>`） | → `cloud.siliconflow.cn/` |
| 小米 MiMo（Xiaomi） | `s.mi.cn/NNI4kZp9`（小米官方短链服务，剥不到官方地址） | **`hide:true`** —— 不联网核验外部地址，宁可不收录也不替原作者引流 |

### 3.2 linkRisk 全量终审（本任务实测，非引用旧报告）

对入库后的 `data/tokens.json`(39) + `data/donots.json`(22) 逐条检查 `link` 与 `extraAction.link`：

- 链接总数 **62** 条，`linkRisk` 命中 **0** 条；
- 原作者码值泄漏词 `lmfh2022 / ygtxup80 / CQLBPC / AATGOEHF / poster-doubao` 在两份数据中出现次数全部为 **0**；
- 含 `poster` 字段的卡 **0** 张（原作者海报物料不入包）。
- 已知旁路（Task 5 报告遗留）：`linkRisk` 对无协议裸短链（如 `s.mi.cn/…`）返回 null；当前 62 条链接全带 `http(s)://` 前缀，无实际泄漏，补丁归属计划 3 爬虫任务。

## 4. 功能对照表（证据分级：已实测 / 仅产物断言 / 未实测+原因）

| 功能 | 状态 | 证据 |
|---|---|---|
| 搜索框检索 | **已实测**（Task 9 dev 浏览器） | 输入 `glm` → 命中 8 条，全文匹配语义与镜像一致；本任务产物侧 SSR「找到 20 条」复位态核对 |
| 类型 chips 筛选 | **已实测**（Task 9）+ 产物断言 | 「编程工具」chip → `#models` hidden、`#tools` 10 张、aria-pressed=true；9 枚 chip 计数随 SSR 落盘（§2） |
| 查看全部/收起 | **已实测**（Task 9） | tools 区块 4→10 展开、按钮变「收起」 |
| 观望名单展开 | **已实测**（Task 9）+ 产物断言 | 默认 5 行（本任务 `out/index.html` grep watch-row = 5）；「展开全部 22 条」→ 22 行 + 「收起名单」（Task 9） |
| 复制微信号 | **未实测（端到端）**——`site-config.wechatId` 为空占位，按计划内设计不渲染复制按钮 | 本任务浏览器实测转化区可见文案「微信号待配置」、`hasCopyBtn=false`；useCopy 成功/失败契约有单测（copy.test.ts 13 例，含 6f604d1 失败路径修正）。配置真实微信号后的点击复制+Toast 待计划 2 数据接入后复验 |
| 海报弹窗 | **未实测（端到端）**——种子无任何含 poster 卡（§3.2 普查 0），能力处于休眠态 | 装配链路（IntelCard→openPoster→PosterDialog）Task 9 已核对；PosterDialog 组件单测/构建在位 |
| ⌘K 聚焦搜索 | **已实测**（Task 9，合成 `meta+k` 事件） | dispatch 后 `document.activeElement.id === "q"`；物理键盘组合未测 |
| 明暗主题切换 | **已实测**（Task 9）+ 红线断言 | light→dark + `localStorage tfb-theme=dark` + reload 保持；红线测试 4 验证 `#f6f4ee/#0f966e/#101815/#7fd8b0` 四令牌随产物 CSS 落地 |
| 详情页（20 个） | **已实测**（本任务浏览器抽验 workbuddy 页）+ 产物断言 | 20/20 目录生成（红线测试 1）；实测六行事实表（额度/模型/实际权益/有效期/核验日期/归属地）、CTA=`https://hunyuan.tencent.com/`（清洗后链接）且 `rel="noopener noreferrer"`、核验说明在位；其余 19 页未逐页开浏览器，以构建路由 + 红线断言覆盖 |
| 内容页 ×4 + 404 | **已实测**（本任务 dev 路由探测 + editorial-policy 内容实测） | `/about/ /editorial-policy/ /privacy/ /contact/` 均 200；未知路由 404；editorial-policy 页实测含清洗五键与 6 项门槛清单、无引流码；产物侧 `out/404.html`、`out/404/index.html` 存在 |
| 控制台健康度 | **已实测** | 首页/详情页/内容页浏览期间 console 仅 React DevTools info 一条，无错误、无 hydration 警告 |

## 5. 无障碍与响应式（spec §5.5/§5.6 人工走查结论）

- 焦点样式：**源码与 CSS 层已落地**——`button/a/input:focus-visible` 统一焦点环（app.css L28-30）、skip-link:focus（L6）、搜索框聚焦描边（L399）。
- 键盘 Tab 顺序全链路（搜索框→chips→卡片→主题切换→观望展开→复制按钮）：**未实测** —— browser-use 连接窗口未持有系统焦点，原生 Tab 键不抵达页面（press_key 后 activeElement 恒为 BODY）；Task 9 亦记录同类工具限制。留待人工键盘走查。
- 390px / 1440px 双视口截图与几何复检：**未实测**（工具无法设定视口尺寸）；Task 9 已在退化窄列下核对 8 张卡脚「徽标×按钮」矩形无交叠。红线测试 5 从产物层保证卡脚无绝对定位大邮戳。
- `prefers-reduced-motion`：**仅 CSS 声明层核对**（tokens.css 该媒体查询在位，本任务未触碰），开启系统减弱动效后的实际表现未实测。
- axe / Lighthouse / Playwright 门禁：**本计划不含**，属计划 2 deploy.yml CI 职责；本文不声称「0 critical」。

## 6. 已知限制与遗留清单

1. 合作情报区块当前为空态：唯一「项目」类型卡（豆包拉新项目）是原作者推广位，被本站配置 `hide:true`，SSR 实测「合作情报 0 条 · 当前没有合作内容」——属正确行为，非缺陷。
2. 海报能力有代码、无数据触发（种子 0 张 poster 卡），端到端未实测。
3. `wechatId` 等变现字段为空占位，复制微信号链路端到端未实测（§4）。
4. axe/Lighthouse 门禁属计划 2 CI。（计划 2 闭环：deploy.yml 三门禁 LCP≤2500ms/CLS≤0.1/A11y≥0.95 配置与推演见 PIPELINE-ACCEPTANCE §5，线上首跑见 ONLINE-STEPS #7）
5. 未建远端仓库，`npm run dev` 仅本机可访问；GitHub Pages 部署属计划 2。（计划 2 闭环：步骤清单见 docs/ONLINE-STEPS.md #1–#3、#7）
6. pageHref 尾斜杠 301/308 语义差：dev 下无斜杠链接 308→带斜杠（本任务 curl 实测），GitHub Pages 为 301，功能无损但状态码不同（Task 10 遗留，未在此修）。
7. stale 黄条判据含 `Date.now()`，存在 hydration 窗口期不一致的理论风险。（计划 2 Task 7 闭环：改挂载后 useState+useEffect 计算，SSR 恒不渲染，风险消解；真实 SHA 上线后的展示复验列入 ONLINE-STEPS #5）
8. 搜索无结果时 EmptyState 由 `#models` 区块承载（`#tools` 整体 hidden），e1f7fed 裁定的方案 A，行为有静态推演、浏览器逐场景复验未做。

## 7. 复现命令

```bash
cd token-fbi-next
npm run build
node --test tests/build-output.test.mjs   # 期望 # pass 5 / # fail 0
npx vitest run                            # 期望 71/71
npx tsc --noEmit                          # 期望 exit 0
# 链接终审（可选复核 §3.2）：node --input-type=module -e "
# import {readFileSync} from 'node:fs'; import {linkRisk} from './crawler/clean.mjs';
# const t=JSON.parse(readFileSync('data/tokens.json','utf8')),d=JSON.parse(readFileSync('data/donots.json','utf8'));
# const bad=[...t,...d].flatMap(x=>[x.link,x.extraAction&&x.extraAction.link].filter(u=>u&&linkRisk(u)));
# console.log('链接风险:',bad.length)"
```

## 8. 口径变更注记（计划 2.5，2026-09-29）

本文件 §1~§7 是**计划 1 验收当时**的实测快照，数字不追改（历史正文保留原值才有对账价值）。
计划 2.5 把数据源从上游 `app.js` 切到 `data.json` 后，以下三个量整体换代，读 §1~§7 时按此换算：

| 量 | §1~§7 里的旧值 | 计划 2.5 之后 |
|---|---|---|
| `data/tokens.json` 卡数（`seed 完成：tokens=`） | 39 | **32** |
| 首页可见集（「找到 N 条情报」）/ 详情页目录数 | 20 | **18** |
| `out/` HTML 总数 / `next build` 路由 | 27 / 28 | **25 / 26** |

新基线的成因、逐条数据口径与全部实测值见 `PIPELINE-ACCEPTANCE.md` §10。UI 侧结论（版面区块、卡脚无
绝对定位邮戳、双主题令牌、断点行为）**不受本次迁移影响**：迁移只换数据来源，不改组件与 CSS；
唯一可见变化是条数与页脚「最近核验」日期（`2026-09-23` → `2026-09-28`）。该值取的是**可见集里最晚的 `updated`**
（`src/components/SiteFooter.tsx:10` 传 `latestUpdated(visibleCards(cards, donots, compiled))`，非构建时间戳）；全库最晚 `updated` 其实是 `2026-09-29`
（`商汤 Token Plan（sensenova）`），但它同时是观望条目、不进情报卡可见集，所以页脚不显示它——
详情页对应文案是「最后核验 {card.updated}」与「站点数据最近更新」。§4 表格里「输入 `glm` → 命中 8 条」
随 GLM-5.3-Flash 下架而失效，重跑实测时的实际命中数取决于当前可见集（搜索语义与实现未变）。

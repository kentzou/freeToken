# Token FBI · 免费 AI 额度情报库

一个**会自己过期**的免费 AI 额度情报站。

线上：**https://kentzou.github.io/freeToken/**

收录各家 AI 厂商的新用户免费额度、限免活动、免费模型池与快讯。每条情报都带**核验时间**与**官方页出处**；活动失效、官方调价或下架，情报随之下架 —— 不做「发出去就不管」的静态榜单。

## 站点有什么

| 栏目 | 路径 | 内容 |
| --- | --- | --- |
| 首页 | `/` | 编辑精选 + 全量情报卡，按分类筛选、关键词搜索 |
| 情报详情 | `/intel/<slug>/` | 单条情报的额度、失效点、最后核验时间与官方出处 |
| OpenRouter 免费模型台账 | `/openrouter/` | 免费模型池实时表 + 账号级限流口径 |
| AI 导航 | `/nav/` | 聚合多家目录站的工具收录，标来源站与抓取时间，可分类/来源筛选，含编辑精选 |
| iGetoken 快讯 | `/igetoken/` | 活动快讯 / 新平台上线 / 积分福利 三类快讯 |
| 编辑原则 | `/editorial-policy/` | 收录与下架的口径，公开可查 |

## 技术栈

- **Next.js 14（App Router）+ React 18**，`output: export` 全静态生成
- **数据即仓库**：所有事实层是 `data/*.json`，没有后端、没有数据库
- **无第三方运行时依赖**，无账号体系、无埋点，纯静态页
- 部署：GitHub Pages（`deploy.yml` 构建并发布）
- 测试：`vitest` 单测 + 导出产物校验

## 目录结构

```
src/
├─ app/                 # 路由：首页 / intel/[slug] / openrouter / igetoken / nav/* / about / contact …
├─ components/          # 卡片、表格、页头页脚等
├─ lib/                 # 数据装载、展示闸（catalog）、SEO、href
└─ styles/

data/                   # 磁盘事实层（构建期只读）
├─ tokens.json          # 情报卡主体
├─ meta.json            # 同步指纹：上游 sha / 指纹 / 条数
├─ rules.json           # 收录规则表
├─ donots.json          # 避让集（明确不收的站点）
├─ nav-index.json       # 导航层索引（清洗后入库面）
├─ openrouter.json      # 免费模型表 + 额度口径
└─ igetoken*.json       # 快讯三栏

config/
├─ site-config.json     # 站点配置面（微信号、推广位、单卡 hide/link 覆盖、adminLogins）
└─ local-cards.json     # 本地增补卡（不在上游数据里的情报）

pending/changes.json    # 待批变更队列（crawl 写入，人工或 CLI 批）

crawler/                # 上游 data.json 适配、清洗、diff 三分类、序列化
scripts/                # 导出修补、SEO、字体子集、review-apply、指纹复现
tests/                  # vitest 单测 + 导出产物校验
.github/workflows/      # 定时抓取 + Pages 部署
```

## 数据管线

```
上游 data.json（hope0719/token-fbi，公开仓库）
        │  crawl.yml 每 6 小时（23 */6 * * *）
        ▼
   适配 + 清洗（去推广参数、按避让集过滤）
        │
        ▼
  diff 三分类：新增 / 修改 / 删除
        │         ├── 新增 ──────────────► 直接写入 data/tokens.json
        │         └── 修改·删除 ─────────► pending/changes.json（等人工批）
        ▼
     构建（npm run build）→ out/ → GitHub Pages
```

配套抓取器各自独立、各自定时：

| 工作流 | 频率（UTC） | 抓什么 |
| --- | --- | --- |
| `crawl.yml` | 每 6 小时 23 分 | 上游情报卡同步 → 写 `data/` 并开待批队列 |
| `crawl-openrouter.yml` | 每日 22:00 | OpenRouter 免费模型表 |
| `crawl-igetoken.yml` | 每日 23:00 | 新平台上线快讯 |
| `crawl-igetoken-deals.yml` | 每日 22:30 | 活动快讯 |
| `crawl-igetoken-perks.yml` | 每日 23:30 | 积分福利 |
| `deploy.yml` | push 到 main 且命中 `data/** src/** …` 等路径 | 构建静态站并发布 Pages |

**为什么「修改/删除」不自动入库**：额度数字会随厂商调价漂移，自动接受等于让旧结论替新事实背书。这一档必须过人工（`pending` 逐条批），只有新增进得来。

## 本地开发

要求 Node 20+（CI 用 22）。

```bash
npm install

npm run dev        # 本地开发 http://localhost:3000
npm run build      # 静态导出到 out/（next build + 导出修补 + 字体子集）
npm run test       # vitest 单测
npm run test:out   # 导出产物校验（页面数、路由、SEO 字段）
npm run seed:repro # 数据指纹复现
npx tsc --noEmit   # 类型检查
npm run lint       # next lint --max-warnings=0
```

> 注意：不要在生产数据上跑 `npm run seed`。它读的是冻结 fixture，会把磁盘事实层打回旧值；只用于回归校验。

## 编辑原则（为什么会有下架）

1. **官方页逐字实证**：卡片上的额度必须能在官方页字节里找到原句，找不到就不收 —— 不先发后补。
2. **会过期，不自动删**：`limited` 到期不等于失效，先扫、再逐页复核官方页，确认活动结束才下架，并在卡面留痕。
3. **不做别人的编辑替身**：上游标为 retired / 观望（watchlist）的条目不提成卡片。
4. **链接干净**：一律官方入口，不带推广码、邀请码、短链、推广位。
5. **可复查**：每张卡带 `checkedAt`，超过时限首页给出「该复查」提示。

## 数据来源与免责

- 情报整理自公开可访问的官方页面；**额度、期限、申领条件一律以厂商官方页为准**，本站只负责记录与时间戳。
- 数据基线同步自公开仓库 [`hope0719/token-fbi`](https://github.com/hope0719/token-fbi) 的 `data.json`，本站做清洗、核验与本地增补。
- 因活动变更、名额耗尽或调价造成的任何损失，本站不承担责任。

## 反馈

发现过期情报、错误额度或死链，请开 Issue 或走 `/contact/`。附上官方页链接与原句最好 —— 有出处的修正会被优先处理。

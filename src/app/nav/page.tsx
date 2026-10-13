import type { Metadata } from "next";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import { loadNavTools } from "@/lib/nav-data";
import { canonicalHref, pageHref } from "@/lib/href";

export const metadata: Metadata = {
  title: "AI 导航｜Token 情报局",
  description:
    "聚合 AI 工具目录站收录的工具，每条标注来源站与抓取时间；含编辑核验精选层，可搜索、按分类与来源筛选。",
  alternates: { canonical: canonicalHref("/nav") },
};

/** 频道首页：数据概览 + 分类入口 + 编辑精选置顶 + 最新收录。
 *  全静态生成：数据在构建期从 data/nav-index.json 读取。 */
export default function NavHome() {
  const { items, index, featured } = loadNavTools();
  const cats = index.categories.filter((c) => c.count > 0);
  const okSites = index.sites.filter((s) => s.status === "ok");

  // 最新收录：按 lastSeen 倒序取 12 条（排除精选层）
  const latest = [...index.items]
    .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""))
    .slice(0, 12);

  // 热门：按 sourceCount 倒序取 8 条
  const hot = [...index.items].sort((a, b) => b.sourceCount - a.sourceCount).slice(0, 8);

  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main">
        <div className="nav-channel">
          <header className="nav-hero">
            <h1>AI 导航</h1>
            <p className="deck">
              聚合 {okSites.length} 个 AI 目录站的公开收录，<strong>每条标注来源站与抓取时间</strong>，
              不冒充官方核验。共收录 <strong>{index.stats.total}</strong> 条工具，覆盖 {cats.length} 个分类。
            </p>
          </header>

          {/* 数据概览 */}
          <div className="nav-stats">
            <div className="stat">
              <strong>{index.stats.total}</strong>
              <span>收录工具</span>
            </div>
            <div className="stat">
              <strong>{index.stats.rawTotal}</strong>
              <span>原始条目</span>
            </div>
            <div className="stat">
              <strong>{index.stats.dedupRemoved}</strong>
              <span>跨站去重</span>
            </div>
            <div className="stat">
              <strong>{cats.length}</strong>
              <span>分类</span>
            </div>
            <div className="stat">
              <strong>{index.updated}</strong>
              <span>更新日期</span>
            </div>
          </div>

          {/* 分类入口 */}
          <section className="nav-block" aria-labelledby="cat-title">
            <h2 id="cat-title">按分类浏览</h2>
            <ul className="cat-grid">
              {cats.map((c) => (
                <li key={c.slug}>
                  <a className="cat-card" href={pageHref(`/nav/category/${c.slug}/`)}>
                    <span className="cat-name">{c.name}</span>
                    <span className="cat-n">{c.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* 编辑核验精选（人工层） */}
          {featured.length ? (
            <section className="nav-block" aria-labelledby="feat-title">
              <h2 id="feat-title">
                编辑核验精选
                <span className="section-count">{featured.length} 个</span>
              </h2>
              <p className="block-note">人工整理并逐条核验的入口，评级与免费档已确认。</p>
              <ul className="tool-grid">
                {featured.map((it) => (
                  <li key={it.id}>
                    <a className="tool-card tool-card-v" href={it.url} target="_blank" rel="noopener noreferrer">
                      <div className="tool-head">
                        <span className="tool-logo tool-logo-ph" aria-hidden="true">{it.name.slice(0, 1)}</span>
                        <strong className="tool-name">{it.name}</strong>
                        <span className="tool-verified" title="编辑核验">已核验</span>
                      </div>
                      <p className="tool-desc">{it.desc}</p>
                      <div className="tool-foot">
                        <span className="tool-cat">{it.tags.join(" · ")}</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* 热门榜预览 */}
          <section className="nav-block" aria-labelledby="hot-title">
            <h2 id="hot-title">
              收录热度榜
              <a className="block-more" href={pageHref("/nav/rankings/")}>查看完整榜单 →</a>
            </h2>
            <p className="block-note">按「被多少来源站收录」排序——这是我们能证实的信号，不用虚构的访问量。</p>
            <ol className="rank-list">
              {hot.map((it, i) => (
                <li key={it.id}>
                  <span className="rank-no">{i + 1}</span>
                  <a className="rank-name" href={pageHref(`/nav/tool/${it.id}/`)}>{it.name}</a>
                  <span className="rank-cat">{it.categoryName}</span>
                  <span className="rank-src">×{it.sourceCount} 站收录</span>
                </li>
              ))}
            </ol>
          </section>

          {/* 最新收录预览 */}
          <section className="nav-block" aria-labelledby="new-title">
            <h2 id="new-title">
              最新收录
              <a className="block-more" href={pageHref("/nav/tools/")}>进入完整目录 →</a>
            </h2>
            <ul className="new-list">
              {latest.map((it) => (
                <li key={it.id}>
                  <a href={pageHref(`/nav/tool/${it.id}/`)}>
                    <strong>{it.name}</strong>
                    <span className="new-desc">{it.desc}</span>
                    <span className="new-src">
                      {it.sources.map((s) => index.sites.find((x) => x.siteId === s.siteId)?.name || s.siteId).join(" · ")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <p className="nav-disclaimer">
            数据说明：本站工具条目来自公开目录站的列表页聚合，抓取时间见各工具详情页。
            定价为文本推断，非官方口径。来源站清单与未收录原因见
            <a href={pageHref("/nav/sources/")}>数据来源页</a>。
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

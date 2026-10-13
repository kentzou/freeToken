import type { Metadata } from "next";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import { loadNavTools } from "@/lib/nav-data";
import { canonicalHref, pageHref } from "@/lib/href";

export const metadata: Metadata = {
  title: "AI 工具榜单｜Token 情报局",
  description: "基于可证实信号的 AI 工具榜单：跨站收录热度榜、分类榜、最新收录榜。",
  alternates: { canonical: canonicalHref("/nav/rankings") },
};

/** 榜单页：只用可证实信号（跨站收录数、首次收录时间），不编造访问量。 */
export default function RankingsPage() {
  const { index } = loadNavTools();
  const items = index.items;

  // 跨站收录热度榜（sourceCount 降序）
  const hot = [...items].sort((a, b) => b.sourceCount - a.sourceCount || a.name.localeCompare(b.name, "zh")).slice(0, 30);

  // 分类榜：每个分类 top5
  const byCat = index.categories
    .filter((c) => c.count > 0)
    .map((c) => ({
      cat: c,
      list: items
        .filter((it) => it.category === c.slug)
        .sort((a, b) => b.sourceCount - a.sourceCount || a.name.localeCompare(b.name, "zh"))
        .slice(0, 5),
    }));

  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main">
        <div className="nav-channel">
          <header className="nav-hero">
            <p className="crumb"><a href={pageHref("/nav/")}>AI 导航</a> / 榜单</p>
            <h1>AI 工具榜单</h1>
            <p className="deck">
              榜单只基于<strong>可证实的信号</strong>：被多少来源站收录、何时首次收录。
              我们<strong>不编造访问量或主观评分</strong>——那些数据我们无法核实。
            </p>
          </header>

          <section className="nav-block" aria-labelledby="hot-title">
            <h2 id="hot-title">跨站收录热度榜 TOP 30</h2>
            <p className="block-note">被越多独立目录站收录，说明越受行业关注。</p>
            <ol className="rank-list rank-list-lg">
              {hot.map((it, i) => (
                <li key={it.id}>
                  <span className={`rank-no ${i < 3 ? "rank-top" : ""}`}>{i + 1}</span>
                  <a className="rank-name" href={pageHref(`/nav/tool/${it.id}/`)}>{it.name}</a>
                  <span className="rank-cat">{it.categoryName}</span>
                  <span className="rank-src">×{it.sourceCount} 站收录</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="nav-block" aria-labelledby="catrank-title">
            <h2 id="catrank-title">分类榜</h2>
            <p className="block-note">每个分类的前 5 名（按跨站收录数）。</p>
            <div className="catrank-grid">
              {byCat.map(({ cat, list }) => (
                <div key={cat.slug} className="catrank">
                  <h3>
                    <a href={pageHref(`/nav/category/${cat.slug}/`)}>{cat.name}</a>
                    <span className="section-count">{cat.count}</span>
                  </h3>
                  <ol className="rank-list">
                    {list.map((it, i) => (
                      <li key={it.id}>
                        <span className="rank-no">{i + 1}</span>
                        <a className="rank-name" href={pageHref(`/nav/tool/${it.id}/`)}>{it.name}</a>
                        <span className="rank-src">×{it.sourceCount}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

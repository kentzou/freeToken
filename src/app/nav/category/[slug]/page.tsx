import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import { loadNavTools } from "@/lib/nav-data";
import { canonicalHref, pageHref } from "@/lib/href";

/** 分类页静态生成：每个非空分类一页，利于 SEO。 */
export function generateStaticParams() {
  const { index } = loadNavTools();
  return index.categories.filter((c) => c.count > 0).map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const { index } = loadNavTools();
  const cat = index.categories.find((c) => c.slug === params.slug);
  if (!cat) return {};
  return {
    title: `${cat.name}（${cat.count} 个）｜AI 工具导航`,
    description: `收录 ${cat.count} 个${cat.name}类 AI 工具，标注来源站与抓取时间。`,
    alternates: { canonical: canonicalHref(`/nav/category/${params.slug}`) },
  };
}

/** 分类页：单分类工具列表，按收录热度排序。 */
export default function CategoryPage({ params }: { params: { slug: string } }) {
  const { index } = loadNavTools();
  const cat = index.categories.find((c) => c.slug === params.slug);
  if (!cat || cat.count === 0) notFound();

  const list = index.items
    .filter((it) => it.category === cat.slug)
    .sort((a, b) => b.sourceCount - a.sourceCount || a.name.localeCompare(b.name, "zh"));

  const others = index.categories.filter((c) => c.count > 0 && c.slug !== cat.slug);

  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main">
        <div className="nav-channel">
          <header className="nav-hero">
            <p className="crumb">
              <a href={pageHref("/nav/")}>AI 导航</a> / <a href={pageHref("/nav/tools/")}>全部工具</a>
            </p>
            <h1>{cat.name}</h1>
            <p className="deck">共 {list.length} 个工具，按被来源站收录次数排序。</p>
          </header>

          <ul className="tool-grid">
            {list.map((it) => (
              <li key={it.id}>
                <a className="tool-card" href={pageHref(`/nav/tool/${it.id}/`)}>
                  <div className="tool-head">
                    {it.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="tool-logo" src={it.logo} alt="" loading="lazy" width={28} height={28} />
                    ) : (
                      <span className="tool-logo tool-logo-ph" aria-hidden="true">{it.name.slice(0, 1)}</span>
                    )}
                    <strong className="tool-name">{it.name}</strong>
                    {it.sourceCount > 1 ? <span className="tool-hot">×{it.sourceCount}</span> : null}
                  </div>
                  <p className="tool-desc">{it.desc || "暂无简介"}</p>
                  <div className="tool-foot">
                    <span className="tool-cat">{it.tags.slice(0, 3).join(" · ") || it.categoryName}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>

          <nav className="cat-others" aria-label="其他分类">
            {others.map((c) => (
              <a key={c.slug} className="chip" href={pageHref(`/nav/category/${c.slug}/`)}>
                {c.name} <span className="chip-n">{c.count}</span>
              </a>
            ))}
          </nav>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

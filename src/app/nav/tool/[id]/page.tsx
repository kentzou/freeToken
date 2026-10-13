import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import { loadNavTools } from "@/lib/nav-data";
import { canonicalHref, pageHref } from "@/lib/href";

/** 详情页静态生成：为全部收录条目生成页面（利于 SEO 长尾）。 */
export function generateStaticParams() {
  const { index } = loadNavTools();
  return index.items.map((it) => ({ id: it.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const { index } = loadNavTools();
  const it = index.items.find((x) => x.id === params.id);
  if (!it) return {};
  return {
    title: `${it.name} - ${it.categoryName}｜AI 工具导航`,
    description: it.desc || `${it.name} 的收录信息、来源站与访问入口。`,
    alternates: { canonical: canonicalHref(`/nav/tool/${params.id}`) },
  };
}

const PRICING_LABEL: Record<string, string> = {
  free: "免费",
  freemium: "免费增值",
  paid: "付费",
  unknown: "未标注",
};

/** 工具详情页：简介、外链、标签、来源溯源区（差异化核心）。 */
export default function ToolPage({ params }: { params: { id: string } }) {
  const { index } = loadNavTools();
  const it = index.items.find((x) => x.id === params.id);
  if (!it) notFound();

  // 同分类推荐（排除自身，取 8 条）
  const related = index.items.filter((x) => x.category === it.category && x.id !== it.id).slice(0, 8);

  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main">
        <div className="nav-channel">
          <p className="crumb">
            <a href={pageHref("/nav/")}>AI 导航</a> /{" "}
            <a href={pageHref(`/nav/category/${it.category}/`)}>{it.categoryName}</a> / {it.name}
          </p>

          <article className="tool-detail">
            <header className="detail-head">
              {it.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="detail-logo" src={it.logo} alt="" width={48} height={48} />
              ) : (
                <span className="detail-logo tool-logo-ph" aria-hidden="true">{it.name.slice(0, 1)}</span>
              )}
              <div className="detail-title">
                <h1>{it.name}</h1>
                <div className="detail-meta">
                  <span className="tool-cat">{it.categoryName}</span>
                  {it.pricing !== "unknown" ? (
                    <span className="pill" title={it.pricingInferred ? "由简介文本推断，非官方口径" : ""}>
                      {PRICING_LABEL[it.pricing]}
                      {it.pricingInferred ? "（推断）" : ""}
                    </span>
                  ) : null}
                  <span className="pill">被 {it.sourceCount} 个来源站收录</span>
                </div>
              </div>
            </header>

            <p className="detail-desc">{it.desc || "暂无简介。"}</p>

            <div className="detail-actions">
              <a className="btn-primary" href={it.url} target="_blank" rel="noopener noreferrer">
                访问官网 →
              </a>
              <span className="detail-hint">跳转第三方站点，本站不承担其内容责任</span>
            </div>

            {it.tags.length ? (
              <div className="detail-tags">
                {it.tags.map((t) => (
                  <span key={t} className="pill">{t}</span>
                ))}
              </div>
            ) : null}
          </article>

          {/* 来源溯源：差异化核心 */}
          <section className="nav-block" aria-labelledby="src-title">
            <h2 id="src-title">数据来源</h2>
            <p className="block-note">
              本条信息由以下目录站的公开列表页聚合而成，可点击回到原页核对。
            </p>
            <ul className="src-list">
              {it.sources.map((s) => {
                const meta = index.sites.find((x) => x.siteId === s.siteId);
                return (
                  <li key={`${s.siteId}-${s.detailUrl}`}>
                    <span className="src-site">{meta?.name || s.siteId}</span>
                    {s.rawCategory ? <span className="src-rawcat">原分类：{s.rawCategory}</span> : null}
                    <span className="src-time">抓取于 {s.fetchedAt.slice(0, 10)}</span>
                    {s.directLink ? (
                      /* 直链收录：来源站未提供站内详情页，卡片直接指向外站 */
                      <span className="src-direct" title="该来源站采用直链收录，无站内详情页">直链收录</span>
                    ) : (
                      <a className="src-link" href={s.detailUrl} target="_blank" rel="noopener noreferrer">
                        查看原页 →
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* 上游栏目归属：跨站聚合的可证实事实。本站分类是我们做的，这些是来源站自己做的——
                两者并列展示，读者才能判断我们的归类有没有偏离。 */}
            {it.rawCategories?.length ? (
              <div className="src-rawset">
                <span className="src-rawset-label">在来源站被归入：</span>
                {it.rawCategories.map((c) => (
                  <span key={c} className="src-rawcat-tag">{c}</span>
                ))}
              </div>
            ) : null}
          </section>

          {related.length ? (
            <section className="nav-block" aria-labelledby="rel-title">
              <h2 id="rel-title">同类工具</h2>
              <ul className="tool-grid">
                {related.map((r) => (
                  <li key={r.id}>
                    <a className="tool-card" href={pageHref(`/nav/tool/${r.id}/`)}>
                      <div className="tool-head">
                        <span className="tool-logo tool-logo-ph" aria-hidden="true">{r.name.slice(0, 1)}</span>
                        <strong className="tool-name">{r.name}</strong>
                      </div>
                      <p className="tool-desc">{r.desc}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import { ctaHref, ctaRel, detailSlug, fmtMd } from "@/lib/copy";
import { canonicalHref, pageHref } from "@/lib/href";
import { visibleCards } from "@/lib/catalog";
import { loadCatalog } from "@/lib/data.server";

export function generateStaticParams() {
  const { cards, donots, compiled } = loadCatalog();
  return visibleCards(cards, donots, compiled).map((c) => ({ slug: detailSlug(c.name, compiled) }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const card = findCard(params.slug);
  if (!card) return { title: "情报不存在 · Token 情报局" };
  return {
    title: `${card.name} 免费额度详情 · Token 情报局`,
    description: card.quota ? card.quota.slice(0, 120) : `${card.name} 的免费额度与领取方式`,
    alternates: { canonical: canonicalHref(`/intel/${params.slug}`) },
  };
}

function findCard(slug: string) {
  const { cards, donots, compiled } = loadCatalog();
  return visibleCards(cards, donots, compiled).find((c) => detailSlug(c.name, compiled) === slug) || null;
}

export default function IntelPage({ params }: { params: { slug: string } }) {
  const card = findCard(params.slug);
  if (!card) notFound();
  const { compiled, meta } = loadCatalog();
  const facts = [
    { k: "额度", v: card.quota || "详见平台说明" },
    { k: "模型", v: card.modality || "—" },
    { k: "实际权益", v: card.effect || "—" },
    { k: "有效期", v: card.limited ? `限时 ${fmtMd(card.limited)}` : "长期有效" },
    { k: "核验日期", v: card.updated },
    { k: "归属地", v: compiled.regionByName[card.name] || "中国大陆" },
  ];
  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main" className="intel-detail">
        <h1 className="detail-name">{card.name}</h1>
        <h2 className="detail-title">情报事实</h2>
        <table className="fact-table">
          <tbody>
            {facts.map((f) => (
              <tr key={f.k}>
                <th scope="row">{f.k}</th>
                <td>{f.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="detail-acts">
          <a className="btn-primary" href={ctaHref(card)} target="_blank" rel={ctaRel(card)}>
            前往平台领取
          </a>
          <a className="btn-ghost" href={pageHref("/")}>
            返回目录
          </a>
        </div>
        <p className="detail-note">
          本页内容摘自上游公开镜像并经推广参数清洗，最后核验于 {card.updated}；站点数据最近更新{" "}
          {meta.lastSyncedAt.slice(0, 10)}。所有「前往平台领取」均直达平台官方页面，不附加任何推广参数。
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

import Masthead from "@/components/Masthead";
import HomeClient from "@/components/HomeClient";
import SiteFooter from "@/components/SiteFooter";
import { loadCatalog } from "@/lib/data.server";
import { dateLine, headline, isoWeek, shortDateLine, visibleCards } from "@/lib/catalog";
import type { Metadata } from "next";
import { canonicalHref } from "@/lib/href";

export const metadata: Metadata = { alternates: { canonical: canonicalHref("/") } };

export default function Page() {
  const catalog = loadCatalog();
  const now = new Date();
  const issue = isoWeek(now);
  const vis = visibleCards(catalog.cards, catalog.donots, catalog.compiled);
  return (
    <div className="page">
      <Masthead
        dateLineText={dateLine(now, issue)}
        shortDate={shortDateLine(now, issue)}
        headlineText={headline(vis.length)}
      />
      <main id="main">
        <HomeClient
          vis={vis}
          donots={catalog.donots}
          compiled={catalog.rules}
          meta={catalog.meta}
          config={catalog.config}
          openrouter={catalog.openrouter}
        />
      </main>
      <SiteFooter />
    </div>
  );
}

import { cleanText, ctaHref, ctaRel, logoFor, shortText } from "@/lib/copy";
import { assetPath } from "@/lib/href";
import type { CompiledRules } from "@/lib/rules";
import type { TokenCard } from "@/lib/types";

export default function PartnerCard({ card, rules }: { card: TokenCard; rules: CompiledRules }) {
  return (
    <article className="partner-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetPath(logoFor(card, rules))} alt="" width={36} height={36} />
      <div>
        <p className="product-line">
          <strong>{cleanText(card.name)}</strong>
          <span className="promoted">推广</span>
        </p>
        <p className="partner-copy">{shortText(card.quota, 64)}</p>
      </div>
      <a className="card-action" href={ctaHref(card)} target="_blank" rel={ctaRel(card)}>
        了解详情
      </a>
    </article>
  );
}

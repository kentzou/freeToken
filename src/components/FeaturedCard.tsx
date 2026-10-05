import { assetPath, intelHref } from "@/lib/href";
import { cleanText, ctaHref, ctaRel, heroTitle, logoFor } from "@/lib/copy";
import { catOf } from "@/lib/catalog";
import type { CompiledRules } from "@/lib/rules";
import type { TokenCard } from "@/lib/types";
import Highlight from "./Highlight";
import StampBadge from "./StampBadge";

export default function FeaturedCard({
  card,
  index,
  rules,
}: {
  card: TokenCard;
  index: 0 | 1;
  rules: CompiledRules;
}) {
  const title = heroTitle(card, index);
  const summary =
    index === 0
      ? "集成多模型的生产力平台，注册即送可观免费额度。"
      : "支持多模型，免费额度助你更高效地完成项目。";
  const facts = ["免费额度", index === 0 ? "新用户领取" : "注册即送", `已核验 ${card.updated}`];
  /* 角标文案跟着这张卡自己的类目走：写死「编程工具精选」是旧版第二格恰为工具卡时的产物，
     精选对换成大模型卡（腾讯元器）后它就变成假标签。精选区只收 editorial（项目卡被
     splitByCategory 分走），所以这里只需区分 工具 / 大模型 两支。 */
  const badgeLabel = catOf(card) === "工具" ? "编程工具精选" : "大模型精选";
  const withBadge = index === 1;
  return (
    <article
      className={withBadge ? "featured-card has-editor-badge" : "featured-card"}
      data-testid="featured-card"
    >
      <div className="featured-content">
        <p className="product-line">
          <img src={assetPath(logoFor(card, rules))} alt="" width={26} height={26} className="product-logo" />
          <a href={intelHref(card, rules)}>
            <strong>{cleanText(card.name)}</strong>
          </a>
        </p>
        <h3>
          {title.lead}
          <Highlight color="y">{title.hl}</Highlight>
        </h3>
        <p className="summary">{summary}</p>
        <p className="featured-action">
          <a className="btn-primary" href={ctaHref(card)} target="_blank" rel={ctaRel(card)}>
            立即领取
          </a>
          <span className="last-check">最后核验 {card.updated}</span>
        </p>
      </div>
      {/* 大邮戳只在精选卡使用绝对定位：右上 vs 左下 CTA，分处两角 */}
      <StampBadge date={card.updated} variant="stamp" tone="brand" />
      <ul className="featured-facts">
        {facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {withBadge ? <span className="editor-badge">{badgeLabel}</span> : null}
    </article>
  );
}

import {
  brandName, cleanText, compactCardCopy, ctaHref, ctaRel, displayName, fmtMd, freeLabel, logoFor,
} from "@/lib/copy";
import { catOf } from "@/lib/catalog";
import { assetPath, intelHref } from "@/lib/href";
import type { CompiledRules } from "@/lib/rules";
import type { TokenCard } from "@/lib/types";
import Highlight from "./Highlight";
import StampBadge from "./StampBadge";
import SubAction from "./SubAction";

/** 情报卡：卡脚上缘虚线分隔，左侧内联核验徽标与右侧操作组 flex 两端对齐（v2 修正，绝不重叠）；
 *  操作组可含「副动作 + 主动作」两枚，窄容器下整组换行、639px 以下各自满宽堆叠（见 app.css）。 */
export default function IntelCard({
  card,
  rules,
  onPoster,
}: {
  card: TokenCard;
  rules: CompiledRules;
  onPoster?: (src: string, name: string) => void;
}) {
  const limited = Boolean(card.limited);
  const copy = compactCardCopy(card, rules);
  const search = cleanText(`${card.name} ${card.modality || ""} ${card.quota || ""} ${card.effect || ""}`).toLowerCase();
  return (
    <article className="intel-card" data-kind={catOf(card)} data-search={search}>
      <header className="card-visual">
        <span className={limited ? "tag tag-limited" : "tag tag-free"}>{freeLabel(card)}</span>
        <img className="card-logo" src={assetPath(logoFor(card, rules))} alt="" width={40} height={40} />
        <span className="visual-brand">{brandName(card)}</span>
      </header>
      <div className="card-body">
        <h3 className="card-title">
          <a href={intelHref(card, rules)}>{displayName(card)}</a>
        </h3>
        <p className="model-line">{copy.models}</p>
        <p className="quota-summary">
          <Highlight color={limited ? "y" : "g"}>{copy.summary}</Highlight>
        </p>
        <p className="card-meta">
          <b>{limited ? `限时 ${fmtMd(card.limited as string)}` : "长期有效"}</b>
          <span className="dot">·</span>
          <span>{card.modality ? cleanText(card.modality).slice(0, 40) : "AI 模型"}</span>
        </p>
      </div>
      <footer className="card-foot">
        <StampBadge date={card.updated} variant="inline" tone={limited ? "warn" : "brand"} />
        <span className="card-actions">
          {card.extraAction ? <SubAction link={card.extraAction.link} text={card.extraAction.text} /> : null}
          {card.poster ? (
            <button
              className="card-action"
              type="button"
              onClick={() => onPoster?.(card.poster as string, card.name)}
            >
              查看海报
            </button>
          ) : (
            <a className="card-action" href={ctaHref(card)} target="_blank" rel={ctaRel(card)}>
              立即领取
            </a>
          )}
        </span>
      </footer>
    </article>
  );
}

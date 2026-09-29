/** 记忆点：「已核验」双环邮戳。stamp=精选大卡（绝对定位右上），inline=情报卡卡脚（流式内联） */
export default function StampBadge({
  date,
  variant = "inline",
  tone = "brand",
}: {
  date: string;
  variant?: "stamp" | "inline";
  tone?: "brand" | "warn";
}) {
  if (variant === "inline") {
    return (
      <span className={`verify-inline verify-${tone}`} data-testid="verify-inline">
        <svg className="verify-ring" width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" focusable="false">
          <circle cx="6.5" cy="6.5" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="6.5" cy="6.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="0.7" />
        </svg>
        <span className="verify-date">{date}</span>
        <span className="visually-hidden">已于 {date} 核验</span>
      </span>
    );
  }
  return (
    <div className={`stamp stamp-${tone}`} aria-hidden="true">
      <span className="stamp-inner">
        <strong>已核验</strong>
        <em>{date}</em>
      </span>
    </div>
  );
}

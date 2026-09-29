/** 空态：虚线框 + 邮戳图标 + 文案；搜索无结果时给出清除入口 */
export default function EmptyState({ title, hint, onClear }: { title: string; hint?: string; onClear?: () => void }) {
  return (
    <div className="empty-state">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
        <circle cx="13" cy="13" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <p>{title}</p>
      {hint ? <p className="hint">{hint}</p> : null}
      {onClear ? (
        <button type="button" className="btn-ghost" onClick={onClear}>
          清除筛选
        </button>
      ) : null}
    </div>
  );
}

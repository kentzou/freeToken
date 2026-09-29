/** 加载骨架：纸白卡 + 微光扫过，尺寸与 IntelCard 一致以避免 CLS */
export default function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <span className="skeleton logo" />
      <span className="skeleton line w-60" />
      <span className="skeleton line w-90" />
      <span className="skeleton line w-40" />
    </div>
  );
}

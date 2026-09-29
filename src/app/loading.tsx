import SkeletonCard from "@/components/SkeletonCard";

export default function Loading() {
  return (
    <div className="intel-grid" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

import type { FilterType } from "@/lib/types";

export const FILTER_CHIPS: { key: FilterType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "大模型", label: "大模型" },
  { key: "工具", label: "编程工具" },
  { key: "limited", label: "限时" },
  { key: "productivity", label: "生产力" },
  { key: "image", label: "图像" },
  { key: "audio", label: "语音" },
  { key: "data", label: "数据" },
  { key: "platform", label: "平台" },
];

export default function FilterChips({
  active,
  counts,
  onPick,
}: {
  active: FilterType;
  counts: Record<FilterType, number>;
  onPick: (t: FilterType) => void;
}) {
  return (
    <nav className="chips" aria-label="情报筛选">
      {FILTER_CHIPS.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={chip.key === active ? "chip is-active" : "chip"}
          aria-pressed={chip.key === active}
          onClick={() => onPick(chip.key)}
        >
          {chip.label}
          <span className="chip-count">{counts[chip.key] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}

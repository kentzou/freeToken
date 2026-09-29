"use client";

import { useState } from "react";
import type { CompiledRules } from "@/lib/rules";
import type { FilterState, TokenCard } from "@/lib/types";
import { modelsFor, toolsFor } from "@/lib/catalog";
import IntelCard from "./IntelCard";
import EmptyState from "./EmptyState";

/** 区块目录：默认 4 张 + 查看全部；搜索或筛选状态下全量展示（镜像 renderCatalog 语义） */
export default function SectionCatalog({
  id,
  title,
  kind,
  items,
  filter,
  rules,
  onPoster,
  onClear,
}: {
  id: "models" | "tools";
  title: string;
  kind: "大模型" | "工具";
  items: TokenCard[];
  filter: FilterState;
  rules: CompiledRules;
  onPoster: (src: string, name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const list = kind === "大模型" ? modelsFor(items, filter) : toolsFor(items, filter);
  const searching = Boolean(filter.query.trim()) || filter.type !== "all";
  const limit = open || searching ? list.length : 4;
  const shown = list.slice(0, limit);
  /* 搜索无结果时空态必须可见（spec §5.4 附清除筛选）：仅大模型区块承载，
   * 另一区块照常隐藏，保证全局恰好一处 EmptyState、不重复渲染 */
  const hideSection = searching && list.length === 0 && id !== "models";

  return (
    <section id={id} className="section" aria-labelledby={`${id}-title`} hidden={hideSection}>
      <h2 id={`${id}-title`} className="section-title">
        {title}
        <span className="section-count">{list.length} 个</span>
      </h2>
      <div className="intel-grid">
        {shown.map((card) => (
          <IntelCard key={card.name} card={card} rules={rules} onPoster={onPoster} />
        ))}
        {!shown.length ? (
          <div className="grid-span">
            <EmptyState
              title={`没有匹配的${title}情报`}
              hint="换个关键词，或清除当前筛选。"
              onClear={onClear}
            />
          </div>
        ) : null}
      </div>
      {!searching && list.length > 4 ? (
        <button className="btn-ghost" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "收起" : "查看全部"}
        </button>
      ) : null}
    </section>
  );
}

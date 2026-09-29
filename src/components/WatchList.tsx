"use client";

import { useState } from "react";
import type { WatchItem } from "@/lib/types";
import WatchRow from "./WatchRow";

export default function WatchList({ items }: { items: WatchItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 5);
  return (
    <section id="watchout" className="section" aria-labelledby="watchout-title">
      <h2 id="watchout-title" className="section-title">
        观望名单<span className="section-count">{items.length} 条</span>
      </h2>
      <p className="section-note">这些平台可用但不建议优先领取，理由已注明。</p>
      <div className="watch-list">
        {shown.map((item) => (
          <WatchRow key={item.name} item={item} />
        ))}
      </div>
      <button className="btn-ghost" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "收起名单" : `展开全部 ${items.length} 条`}
      </button>
    </section>
  );
}

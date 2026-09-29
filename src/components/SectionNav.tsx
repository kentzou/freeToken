"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "featured", label: "今日头条" },
  { id: "models", label: "大模型" },
  { id: "tools", label: "编程工具" },
  { id: "partners", label: "合作情报" },
  { id: "watchout", label: "观望名单" },
];

/** 桌面：报栏式锚点行，当前区块高亮（IntersectionObserver）；移动：抽屉，条目 ≥44px */
export default function SectionNav() {
  const [active, setActive] = useState("featured");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5] }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div className="section-nav">
      <button
        className="nav-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="section-nav-list"
        onClick={() => setOpen(!open)}
      >
        版面
      </button>
      <nav id="section-nav-list" className={open ? "mast-nav is-open" : "mast-nav"} aria-label="版面导航">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={s.id === active ? "is-current" : undefined} onClick={() => setOpen(false)}>
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

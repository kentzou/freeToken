"use client";

import { useMemo, useState } from "react";
import StampBadge from "./StampBadge";

export interface NavItem {
  name: string;
  desc: string;
  link: string;
  tags: string[];
  freeTier: boolean;
  rating: number;
  updated: string;
  category: "llm" | "aggregator" | "devtools";
  limited?: boolean;
}

export interface NavNews {
  title: string;
  source: string;
  url: string;
  date: string;
}

const CATEGORY_LABEL: Record<NavItem["category"], string> = {
  llm: "大模型",
  aggregator: "聚合网站",
  devtools: "编程工具",
};

const CATEGORY_ORDER: NavItem["category"][] = ["llm", "aggregator", "devtools"];

const FREE_LABEL: Record<string, string> = {
  limited: "限时免费",
  free: "免费额度",
  paid: "付费/增值",
};

export default function NavClient({ items, news }: { items: NavItem[]; news: NavNews[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | NavItem["category"]>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  /* 默认按「最近更新」而非评级：2026-10-15 用户裁决，与首页大模型／编程工具板块同一口径
     （rank() 亦改成日期优先）。评级仍是可选项，不删控件。 */
  const [sort, setSort] = useState<"rating" | "updated">("updated");

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((it) => {
      if (category !== "all" && it.category !== category) return false;
      if (freeOnly && !it.freeTier) return false;
      if (tag && !it.tags.includes(tag)) return false;
      if (q) {
        const hay = `${it.name} ${it.desc} ${it.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) =>
      sort === "rating" ? b.rating - a.rating : b.updated.localeCompare(a.updated)
    );
    return list;
  }, [items, query, category, tag, freeOnly, sort]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const it of filtered) it.tags.forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [filtered]);

  const sections = CATEGORY_ORDER.map((cat) => ({
    cat,
    list: filtered.filter((it) => it.category === cat),
  })).filter((s) => s.list.length > 0);

  return (
    <div className="nav-page">
      <header className="nav-hero">
        <h1>AI 导航</h1>
        <p className="deck">
          大模型、AI 聚合平台与编程工具一站直达。「免费额度」＝含免费档或可免费使用：大模型栏来自本站情报管线、逐条核验；聚合网站与编程工具两栏为编辑按公开资料精选整理，评级与日期为构建期快照。
        </p>
      </header>

      <div className="nav-controls">
        <div className="search-wrap">
          <label className="visually-hidden" htmlFor="nav-q">
            搜索导航
          </label>
          <input
            id="nav-q"
            className="search"
            type="search"
            value={query}
            placeholder="搜索模型、平台或工具关键词"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="nav-row">
          <nav className="chips" aria-label="分类筛选">
            <button
              type="button"
              className={category === "all" ? "chip is-active" : "chip"}
              onClick={() => setCategory("all")}
            >
              全部
              <span className="chip-count">{categoryCounts.all}</span>
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                className={category === c ? "chip is-active" : "chip"}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABEL[c]}
                <span className="chip-count">{categoryCounts[c] ?? 0}</span>
              </button>
            ))}
          </nav>

          <div className="nav-tools">
            <label className="free-toggle">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
              />
              仅看免费额度
            </label>
            <label className="sort-select">
              <span>排序</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "rating" | "updated")}
              >
                <option value="rating">评级高→低</option>
                <option value="updated">最近更新</option>
              </select>
            </label>
          </div>
        </div>

        {availableTags.length > 0 && (
          <nav className="chips" aria-label="标签筛选">
            <button
              type="button"
              className={tag === null ? "chip is-active" : "chip"}
              onClick={() => setTag(null)}
            >
              全部标签
            </button>
            {availableTags.map((t) => (
              <button
                key={t}
                type="button"
                className={tag === t ? "chip is-active" : "chip"}
                onClick={() => setTag(tag === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </nav>
        )}
      </div>

      {sections.length === 0 && (
        <p className="nav-empty">没有匹配的结果，换个关键词或标签试试。</p>
      )}

      {sections.map((s) => (
        <section key={s.cat} className="nav-section" id={`cat-${s.cat}`}>
          <h2 className="nav-section-title">
            {CATEGORY_LABEL[s.cat]}
            <span className="nav-section-count">{s.list.length} 个</span>
          </h2>
          <div className="nav-grid">
            {s.list.map((it) => {
              const freeKey = it.limited ? "limited" : it.freeTier ? "free" : "paid";
              return (
                <article key={it.name} className="intel-card nav-card">
                  <header className="card-visual">
                    <span
                      className={
                        freeKey === "limited"
                          ? "tag tag-limited"
                          : freeKey === "free"
                            ? "tag tag-free"
                            : "tag"
                      }
                    >
                      {FREE_LABEL[freeKey]}
                    </span>
                    <span className="visual-brand">{CATEGORY_LABEL[it.category]}</span>
                  </header>
                  <div className="card-body">
                    <h3 className="card-title">
                      <a href={it.link} target="_blank" rel="noopener noreferrer">
                        {it.name}
                      </a>
                    </h3>
                    <p className="nav-desc">{it.desc}</p>
                    <div className="nav-tags">
                      {it.tags.map((t) => (
                        <span key={t} className="nav-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="card-meta">
                      <b>评级 {it.rating}/5</b>
                      <span className="dot">·</span>
                      <span>{it.tags[0]}</span>
                    </p>
                  </div>
                  <footer className="card-foot">
                    <StampBadge
                      date={it.updated}
                      variant="inline"
                      tone={it.limited ? "warn" : "brand"}
                      verb={it.category === "llm" ? "核验" : "整理"}
                    />
                    <span className="card-actions">
                      <a
                        className="card-action"
                        href={it.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        直达 ↗
                      </a>
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {news.length > 0 && (
        <section className="nav-section nav-news">
          <h2 className="nav-section-title">
            动态追踪
            <span className="nav-section-count">编辑整理 · 构建快照</span>
          </h2>
          <ul className="news-list">
            {news.map((n) => (
              <li key={`${n.url}-${n.title}`} className="news-item">
                <a href={n.url} target="_blank" rel="noopener noreferrer">
                  {n.title}
                </a>
                <span className="news-meta">
                  {n.source}
                  <span className="dot">·</span>
                  {n.date}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

"use client";

/** 导航目录客户端组件：搜索 + 分类切换 + 四维筛选 + 分页加载。
 *  大列表策略：客户端全量过滤（1928 条 useMemo 过滤为毫秒级），
 *  分页仅控制渲染量，避免一次性铺 1928 个 DOM 节点。
 *  零请求：数据由服务端组件注入，纯前端交互。 */
import { useMemo, useState } from "react";
import type { NavCategory, NavSiteMeta, NavTool } from "@/lib/nav-data";
import EmptyState from "./EmptyState";

const PAGE = 60;

const PRICING_LABEL: Record<string, string> = {
  free: "免费",
  freemium: "免费增值",
  paid: "付费",
  unknown: "未标注",
};

/** 来源站徽标简称（避免长名撑破卡片）。 */
const SITE_SHORT: Record<string, string> = {
  aibot: "AI工具集",
  aigc: "AIGC导航",
  aihub: "AIHub",
  openi: "OpenI",
  aitop100: "AITOP100",
  maomu: "猫目",
  aibase: "AIbase",
  rankmyai: "RankmyAI",
  topai: "TopAI",
  aishenqi: "神器大全",
  fly63: "fly63",
  futurepedia: "Futurepedia",
};

export default function NavDirectory({
  items,
  categories,
  sites,
}: {
  items: NavTool[];
  categories: NavCategory[];
  sites: NavSiteMeta[];
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [source, setSource] = useState<string>("all");
  const [sort, setSort] = useState<"sourceCount" | "name">("sourceCount");
  const [limit, setLimit] = useState(PAGE);

  const okSites = sites.filter((s) => s.status === "ok");
  const catList = categories.filter((c) => c.count > 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((it) => {
      if (cat !== "all" && it.category !== cat) return false;
      if (freeOnly && it.pricing !== "free" && it.pricing !== "freemium") return false;
      if (source !== "all" && !it.sources.some((s) => s.siteId === source)) return false;
      if (q) {
        const hay = `${it.name} ${it.desc} ${it.tags.join(" ")} ${it.categoryName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) =>
      sort === "sourceCount"
        ? b.sourceCount - a.sourceCount || a.name.localeCompare(b.name, "zh")
        : a.name.localeCompare(b.name, "zh")
    );
    return list;
  }, [items, query, cat, freeOnly, source, sort]);

  const shown = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  return (
    <div className="nav-dir">
      {/* 控制区：搜索 */}
      <div className="nav-controls">
        <div className="search-wrap">
          <label className="visually-hidden" htmlFor="nav-q">搜索 AI 工具</label>
          <input
            id="nav-q"
            className="search"
            type="search"
            value={query}
            placeholder="搜索工具名称、简介或标签…"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
        </div>
      </div>

      {/* 一级分类横排 */}
      <div className="nav-cats" role="tablist" aria-label="分类筛选">
        <button
          type="button"
          className={`chip ${cat === "all" ? "chip-on" : ""}`}
          role="tab"
          aria-selected={cat === "all"}
          onClick={() => { setCat("all"); setLimit(PAGE); }}
        >
          全部 <span className="chip-n">{items.length}</span>
        </button>
        {catList.map((c) => (
          <button
            key={c.slug}
            type="button"
            className={`chip ${cat === c.slug ? "chip-on" : ""}`}
            role="tab"
            aria-selected={cat === c.slug}
            onClick={() => { setCat(c.slug); setLimit(PAGE); }}
          >
            {c.name} <span className="chip-n">{c.count}</span>
          </button>
        ))}
      </div>

      {/* 二级筛选：定价 / 来源 / 排序 */}
      <div className="nav-subfilters">
        <label className="nav-check">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => { setFreeOnly(e.target.checked); setLimit(PAGE); }}
          />
          仅免费/免费增值
        </label>

        <label className="nav-select">
          来源
          <select value={source} onChange={(e) => { setSource(e.target.value); setLimit(PAGE); }}>
            <option value="all">全部来源</option>
            {okSites.map((s) => (
              <option key={s.siteId} value={s.siteId}>
                {SITE_SHORT[s.siteId] || s.name}（{s.count}）
              </option>
            ))}
          </select>
        </label>

        <label className="nav-select">
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value as "sourceCount" | "name")}>
            <option value="sourceCount">按收录热度</option>
            <option value="name">按名称</option>
          </select>
        </label>

        <span className="nav-count" aria-live="polite">
          匹配 {filtered.length} 条
        </span>
      </div>

      {/* 结果网格 */}
      {shown.length ? (
        <ul className="tool-grid">
          {shown.map((it) => (
            <li key={it.id}>
              <a className="tool-card" href={`/nav/tool/${it.id}/`}>
                <div className="tool-head">
                  {it.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tool-logo" src={it.logo} alt="" loading="lazy" width={28} height={28} />
                  ) : (
                    <span className="tool-logo tool-logo-ph" aria-hidden="true">{it.name.slice(0, 1)}</span>
                  )}
                  <strong className="tool-name">{it.name}</strong>
                  {it.sourceCount > 1 ? (
                    <span className="tool-hot" title={`被 ${it.sourceCount} 个来源站收录`}>×{it.sourceCount}</span>
                  ) : null}
                </div>
                <p className="tool-desc">{it.desc || "暂无简介"}</p>
                <div className="tool-foot">
                  <span className="tool-cat">{it.categoryName}</span>
                  <span className="tool-src">
                    {it.sources.map((s) => SITE_SHORT[s.siteId] || s.siteId).join(" · ")}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="没有匹配的工具"
          hint="换个关键词，或放宽筛选条件。"
          onClear={() => { setQuery(""); setCat("all"); setFreeOnly(false); setSource("all"); setLimit(PAGE); }}
        />
      )}

      {hasMore ? (
        <div className="nav-more">
          <button className="btn-ghost" type="button" onClick={() => setLimit(limit + PAGE)}>
            加载更多（剩 {filtered.length - limit} 条）
          </button>
        </div>
      ) : null}
    </div>
  );
}

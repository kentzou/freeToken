"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterType, MetaJson, RulesJson, SiteConfig, TokenCard, WatchItem } from "@/lib/types";
import { compiledRules } from "@/lib/rules";
import { chipCounts, matchesFilter, splitByCategory } from "@/lib/catalog";
import FilterChips from "./FilterChips";
import FeaturedCard from "./FeaturedCard";
import PartnerCard from "./PartnerCard";
import PosterDialog from "./PosterDialog";
import SearchBar from "./SearchBar";
import SectionCatalog from "./SectionCatalog";
import Toast from "./Toast";
import ConversionBand from "./ConversionBand";
import WatchList from "./WatchList";
import { useCopy } from "./useCopy";

export default function HomeClient({
  vis,
  donots,
  compiled,
  meta,
  config,
}: {
  /** 服务端已算好的可见集（visibleCards 只在 page.tsx 调用一次，避免客户端重复计算） */
  vis: TokenCard[];
  donots: WatchItem[];
  /** RulesJson 线格式（source+flags 纯对象）：RegExp 是类实例，Next 14 Flight 不允许 Server→Client 直传；
   *  种子脚本本就按「可 JSON 序列化」出参 rules.json，此处用纯函数 compiledRules() 在边界内还原 */
  compiled: RulesJson;
  meta: MetaJson;
  config: SiteConfig;
}) {
  const [type, setType] = useState<FilterType>("all");
  const [query, setQuery] = useState("");
  const [poster, setPoster] = useState<{ src: string; name: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { copy, message } = useCopy();

  /* 边界内还原 RegExp（与 loadCatalog 走同一纯函数，种子数据为唯一事实源） */
  const rules = useMemo(() => compiledRules(compiled), [compiled]);

  /* 数据超过 24h 未同步：顶部琥珀黄条，内容照常（spec §5.4）。Date.now() 只在挂载后算：
     SSR 与客户端首帧同判 stale=false，杜绝 hydration 不一致（终审遗留 #9，
     真实 lastSyncedSha 上线后本逻辑才真正参与渲染） */
  const [stale, setStale] = useState(false);
  useEffect(() => {
    setStale(Boolean(meta.lastSyncedSha) && Date.now() - Date.parse(meta.lastSyncedAt) > 24 * 3600 * 1000);
  }, [meta]);

  /* ⌘K 聚焦搜索框 */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filter = useMemo(() => ({ type, query }), [type, query]);
  const matched = useMemo(() => vis.filter((c) => matchesFilter(c, filter)), [vis, filter]);
  const counts = useMemo(() => chipCounts(vis), [vis]);
  /* 精选区与筛选无关：镜像 app.js:1136 在 renderCatalog 之外只渲染一次
     editorial.slice(0,2)（editorial = VISIBLE 剔除「项目」，app.js:1050），
     搜索/切 chip 都不动它；区块列表用完整 matched（精选卡同现于区块，镜像无排除逻辑） */
  const featured = useMemo(
    () => splitByCategory(vis).editorial.slice(0, 2) as [TokenCard, TokenCard?],
    [vis]
  );
  const partners = useMemo(() => vis.filter((c) => c.type === "项目"), [vis]);
  const openPoster = useCallback((src: string, name: string) => setPoster({ src, name }), []);

  return (
    <>
      {stale ? (
        <p className="sync-banner" role="status">
          数据同步中，当前为 {meta.lastSyncedAt.slice(0, 10)} 版
        </p>
      ) : null}
      <div className="toolbar">
        <SearchBar value={query} onChange={setQuery} inputRef={searchRef} />
        <FilterChips active={type} counts={counts} onPick={setType} />
        <p className="result-count" role="status">
          找到 {matched.length} 条情报
        </p>
      </div>

      <section id="featured" className="section" aria-labelledby="featured-title">
        <h2 id="featured-title" className="section-title">
          今日头条<span className="section-count">精选 2 条</span>
        </h2>
        <div className="featured-grid">
          {featured[0] ? <FeaturedCard card={featured[0]} index={0} rules={rules} /> : null}
          {featured[1] ? <FeaturedCard card={featured[1]} index={1} rules={rules} /> : null}
        </div>
      </section>

      <SectionCatalog
        id="models"
        title="大模型"
        kind="大模型"
        items={matched}
        filter={filter}
        rules={rules}
        onPoster={openPoster}
        onClear={() => {
          setType("all");
          setQuery("");
        }}
      />
      <SectionCatalog
        id="tools"
        title="编程工具"
        kind="工具"
        items={matched}
        filter={filter}
        rules={rules}
        onPoster={openPoster}
        onClear={() => {
          setType("all");
          setQuery("");
        }}
      />

      <section id="partners" className="section" aria-labelledby="partners-title">
        <h2 id="partners-title" className="section-title">
          合作情报<span className="section-count">{partners.length} 条</span>
        </h2>
        <p className="section-note">含商业合作，均已标注，不影响其余条目的中立核验。</p>
        <div className="partner-list">
          {partners.map((c) => (
            <PartnerCard key={c.name} card={c} rules={rules} />
          ))}
          {!partners.length ? <p className="section-note">当前没有合作内容。</p> : null}
        </div>
      </section>

      <WatchList items={donots} />

      <ConversionBand wechatId={config.wechatId || ""} onCopy={(text) => void copy(text)} />

      <Toast message={message} />
      <PosterDialog src={poster?.src ?? null} name={poster?.name ?? ""} onClose={() => setPoster(null)} />
    </>
  );
}

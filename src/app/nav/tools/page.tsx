import type { Metadata } from "next";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import NavDirectory from "@/components/NavDirectory";
import { loadNavTools } from "@/lib/nav-data";
import { canonicalHref } from "@/lib/href";

export const metadata: Metadata = {
  title: "全部 AI 工具目录｜Token 情报局",
  description: "搜索并按分类、来源、免费档筛选全部收录的 AI 工具，每条标注来源站与抓取时间。",
  alternates: { canonical: canonicalHref("/nav/tools") },
};

/** 全量目录页：客户端搜索 + 多维筛选（数据由服务端注入，零请求）。 */
export default function NavToolsPage() {
  const { items, index } = loadNavTools();
  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main">
        <div className="nav-channel">
          <header className="nav-hero">
            <h1>全部工具目录</h1>
            <p className="deck">
              共 {items.length} 条（含 {index.items.length} 条聚合收录 + 编辑精选）。
              按分类、来源站、免费档筛选，或直接搜索。
            </p>
          </header>
          <NavDirectory items={items} categories={index.categories} sites={index.sites} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

import SiteFooter from "@/components/SiteFooter";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import AdminApp from "./AdminApp";
import { canonicalHref } from "@/lib/href";

/** 后台不进取索引面：robots 关 index（§3 D5——robots.txt 里不加 Disallow，理由见计划正文）。
 *  title 与 description 都写明「非公开页」，避免搜索结果里出现一个读不懂的 /admin。 */
export const metadata = {
  title: "值班室 · 管理后台 · Token 情报局",
  description: "本站的数据审核与配置后台：待审变更、变现配置、触发爬取、发布历史。需 GitHub Device Flow 登录。",
  alternates: { canonical: canonicalHref("/admin") },
  robots: { index: false, follow: true },
};

export default function AdminPage() {
  return (
    <div className="page">
      <SiteHeaderLite />
      <AdminApp />
      <SiteFooter />
    </div>
  );
}

import { pageHref } from "@/lib/href";

/** 页脚纯展示：不读数据源。此前的「数据源自…/最近核验/同步于」一句已按用户要求删除，
 *  随之 loadCatalog 及 latest/isoWeek 依赖整体移除——页脚不再随数据变动重渲，三处调用点天然一致。 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        <strong>Token 情报局</strong> · 非官方爱好者项目 · 内容版权归原站作者
      </p>
      <nav className="footer-links" aria-label="站点信息">
        <a href={pageHref("/about/")}>关于</a>
        <a href={pageHref("/editorial-policy/")}>精选门槛</a>
        <a href={pageHref("/privacy/")}>隐私</a>
        <a href={pageHref("/contact/")}>联系</a>
      </nav>
    </footer>
  );
}

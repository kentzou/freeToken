import SiteHeaderLite from "./SiteHeaderLite";
import SiteFooter from "./SiteFooter";

/** 简实内容页共用版式：精简顶栏 + h1 页名 + 正文 + 页脚，四个页面共用一套，不各写一遍 */
export default function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main" className="prose">
        <h1>{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

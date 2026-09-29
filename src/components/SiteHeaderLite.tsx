import { pageHref } from "@/lib/href";

/** 详情页/内容页共用精简顶栏（原型 shell-top，2026-09-29 设计裁决） */
export default function SiteHeaderLite() {
  return (
    <div className="shell-top">
      <a className="shell-brand" href={pageHref("/")}>
        <span className="shell-avatar" aria-hidden="true">T</span>
        Token 情报局
      </a>
      <nav aria-label="站内导航">
        <a href={pageHref("/")}>首页</a>
        <a href={pageHref("/editorial-policy")}>编辑规则</a>
        <a href={pageHref("/contact")}>联系投稿</a>
      </nav>
    </div>
  );
}

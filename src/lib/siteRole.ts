import type { Metadata } from "next";

/** 部署口径——「这份产物将被放到哪个位置上」。
 *
 *  primary（缺省）＝主站：canonical 指自己，自带 robots.txt + sitemap.xml。
 *  Pages 的 deploy.yml 不设这个变量，走的就是这一支。
 *  mirror＝副本站：`NEXT_PUBLIC_SITE_URL` 给主站地址（于是每页 canonical 指主站），
 *  但本站不进索引、也不自带 sitemap——sitemap 的 `loc` 必须与 sitemap 文件所在主机同源，
 *  副本放一份「loc 全是别人地址」的清单属于跨主机 sitemap，按规范要另行验证才生效，
 *  静默无效比 404 更难被发现。
 *
 *  为什么必须显式声明而不能自动判断：静态导出不知道自己会被放到哪个主机上，
 *  「同一份产物多处部署」正是镜像那次 26 条 404 的成因（见 docs/PUBLISH-NOTES.md）。
 *
 *  为什么变量名带 NEXT_PUBLIC_：口径不只影响服务端渲染（robots、sitemap），还决定
 *  站内链接落成什么形态（见 href.ts 的 pageHref），而 SectionCatalog 这类 "use client"
 *  组件在浏览器里也会重渲染卡片——只有 NEXT_PUBLIC_ 前缀的量会被内联进浏览器包，
 *  裸 SITE_ROLE 在浏览器里读成 undefined，就会让同一份镜像产物「服务端链接对、点一下查看全部就错」。 */
export type SiteRole = "primary" | "mirror";

const raw = (process.env.NEXT_PUBLIC_SITE_ROLE ?? "").trim();
if (raw !== "" && raw !== "primary" && raw !== "mirror") {
  /* 拼错就地失败：静默回落成 primary，就会把镜像当主站发出去——那正是这次要防的事故形态。 */
  throw new Error(
    `NEXT_PUBLIC_SITE_ROLE 只接受 primary|mirror，收到 ${JSON.stringify(process.env.NEXT_PUBLIC_SITE_ROLE)}`
  );
}

export const SITE_ROLE: SiteRole = raw === "mirror" ? "mirror" : "primary";

/* 镜像用 noindex + follow：爬虫照样顺链走，且能在同一页同时看见这条与 canonical，
   两个信号不打架（robots.txt 里 Disallow 会让爬虫看不见这两者）。
   主站给 undefined——不往 <head> 里塞一个多余的 robots 标签。 */
export const ROBOTS_META: Metadata["robots"] | undefined =
  SITE_ROLE === "mirror" ? { index: false, follow: true } : undefined;

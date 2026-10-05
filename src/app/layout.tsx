import type { Metadata } from "next";
import "@fontsource/noto-serif-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-900.css";
import "@fontsource/noto-serif-sc/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./globals.css";
import { canonicalAsset, SITE_URL } from "@/lib/href";
import { ROBOTS_META } from "@/lib/siteRole";

/* metadataBase 用 href.ts 的 SITE_URL（线上 Pages 地址由 NEXT_PUBLIC_SITE_URL 注入，deploy.yml 已接；
   本地构建为空串 → 不出 absolute URL）。不在这里重读 env：同一个地址读两次就是两个口径。 */

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  /* 镜像口径下全站 noindex, follow（主站为 undefined，等于不写这条标签）。
     放在根 layout 是因为镜像的每一页都要带——放在某个页面里就等于只保护那一路由。
     与 canonical 指主站是同一个裁决的两半：只声明「正式地址在别处」而不拒绝索引，
     是把「谁来竞争排名」的决定权交给爬虫；noindex 才是「镜像不争排名」的显式表态，
     而 follow 保证爬虫仍能顺链看见同页的 canonical，把权重归到主站。 */
  robots: ROBOTS_META,
  title: "Token 情报局｜免费 AI 额度情报",
  description: "核验过的免费 AI 额度、模型与编程工具情报，每 6 小时同步一次。",
  openGraph: {
    type: "website",
    siteName: "Token 情报局",
    title: "Token 情报局｜免费 AI 额度情报",
    description: "核验过的免费 AI 额度、模型与编程工具情报，每 6 小时同步一次。",
    /* 本站自绘封面（非上游素材）。走 canonicalAsset 而非 assetPath：线上口径下 metadataBase 的 pathname
       已含 BASE，再交给 Next 一个带 BASE 的相对串会叠成双前缀（Task 6 Step 10 实测），故这里直接给绝对地址。 */
    images: [
      {
        url: canonicalAsset("assets/og-cover.png"),
        width: 1536,
        height: 1024,
        alt: "Token 情报局：核验过的免费 AI 额度情报",
      },
    ],
  },
  /* 只覆盖 card：title/description 由 Next 从 openGraph 派生，复制一份就是第二个漂移点 */
  twitter: { card: "summary_large_image" },
};

/* 主题内联脚本：首屏绘制前定 data-theme，避免明暗闪白 */
/* 首屏防闪：必须在首次绘制前把 data-theme 写好。
   口径必须与 src/lib/theme.ts 的 resolveTheme **逐条一致**——无记录或值非法一律 dark（默认暗色），
   只有 localStorage 里的合法值才被采纳；两处若不一致，会出现「首屏暗色、React 接管后跳回亮色」。
   catch 分支同样写 dark：隐私模式下 localStorage 读取会抛，此时若不写属性，
   data-theme 就整体缺失，CSS 会落回 :root 的亮色令牌——等于绕过了本次改动。
   保持字面量、零插值（全站仅此一处内联注入点，见 tests/hygiene.test.ts 的注入面围栏断言）。 */
const themeScript = `(function(){try{var k='tfb-theme';var m=localStorage.getItem(k);document.documentElement.setAttribute('data-theme',(m==='light'||m==='dark')?m:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main">跳到正文</a>
        {children}
      </body>
    </html>
  );
}

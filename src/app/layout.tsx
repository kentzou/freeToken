import type { Metadata } from "next";
import "@fontsource/noto-serif-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-900.css";
import "@fontsource/noto-serif-sc/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./globals.css";
import { assetPath } from "@/lib/href";

/* 线上 Pages 地址由 NEXT_PUBLIC_SITE_URL 注入（deploy.yml 已接）；本地构建为空 → 不出 absolute URL */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "";

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: "Token 情报局｜免费 AI 额度情报",
  description: "核验过的免费 AI 额度、模型与编程工具情报，每 6 小时同步一次。",
  openGraph: {
    type: "website",
    siteName: "Token 情报局",
    title: "Token 情报局｜免费 AI 额度情报",
    description: "核验过的免费 AI 额度、模型与编程工具情报，每 6 小时同步一次。",
    /* 本站自绘封面（非上游素材）。assetPath 自带 BASE 前缀，故线上口径为 /<repo>/assets/... ；
       metadataBase 提供 origin，绝对路径解析后正好落回 https://<owner>.github.io/<repo>/assets/... */
    images: [
      {
        url: assetPath("assets/og-cover.png"),
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
const themeScript = `(function(){try{var k='tfb-theme';var m=localStorage.getItem(k);var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=m||(d?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

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

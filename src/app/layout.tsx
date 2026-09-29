import type { Metadata } from "next";
import "@fontsource/noto-serif-sc/chinese-simplified-700.css";
import "@fontsource/noto-serif-sc/chinese-simplified-900.css";
import "@fontsource/noto-serif-sc/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token 情报局｜免费 AI 额度情报",
  description: "核验过的免费 AI 额度、模型与编程工具情报，每 6 小时同步一次。",
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

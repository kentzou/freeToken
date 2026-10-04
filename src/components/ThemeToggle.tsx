"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, nextTheme, resolveTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  /* SSR 首帧用默认暗色：与 layout 内联脚本的「无记录即 dark」口径一致。
     客户端 useEffect 会在挂载后用真实值（用户已保存的选择）覆盖，用户选过浅色时按钮文案会自动纠正。 */
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  /* 首屏由 layout 内联脚本决定，客户端读取以保持一致。
     内联脚本只会写合法的 'light' / 'dark'，所以 attr 恒为合法值，resolveTheme 原样返回它——
     这里传 prefersDark 只是沿用旧签名，attr 有效时它不参与决策（见 lib/theme.ts 的说明）。 */
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(resolveTheme(attr, prefersDark));
  }, []);

  function toggle() {
    const t = nextTheme(theme);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* 隐私模式下静默降级，仅本次会话生效 */
    }
    setTheme(t);
  }

  const dark = theme === "dark";
  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-pressed={dark}>
      <span aria-hidden="true">{dark ? "☾" : "☀"}</span>
      {dark ? "暗色" : "浅色"}
    </button>
  );
}

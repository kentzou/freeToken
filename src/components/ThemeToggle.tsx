"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, nextTheme, resolveTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  /* 首屏由 layout 内联脚本决定，客户端读取以保持一致 */
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

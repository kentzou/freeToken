export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "tfb-theme";

/** 无用户记录（首次访问 / 记录被清 / 值非法）时使用的默认主题。
 *  站点默认暗色：只有用户**明确**表过偏好（localStorage 里有合法值）才跟随他，
 *  「系统是亮色」不再构成放弃暗色的理由。 */
export const DEFAULT_THEME: Theme = "dark";

/** 用户选择优先；缺失/非法值一律回退 DEFAULT_THEME（暗色），不再看系统偏好。
 *
 *  `prefersDark` 是**刻意保留**的参数，不是漏用的残留：
 *  - 删掉它会连带改坏 ThemeToggle 的调用点（`resolveTheme(attr, prefersDark)`）；
 *  - 保留它才能在将来恢复「无记录时跟随系统」时只改这一处实现、不动任何调用方。
 *  当前实现里它不参与决策（下方 `void prefersDark` 是显式声明，不是遗漏），
 *  因为两处口径必须一致：layout.tsx 的首屏内联脚本同样在无记录时直接写 dark，
 *  若这里改为跟随系统，就会出现「首屏暗色、React 接管后跳回亮色」的跳变。 */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  void prefersDark; // 见上方注释：刻意不参与决策，保留签名只为向后兼容
  return DEFAULT_THEME;
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

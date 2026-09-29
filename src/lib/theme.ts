export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "tfb-theme";

/** 用户选择优先；非法/缺失值回退系统偏好 */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  return stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

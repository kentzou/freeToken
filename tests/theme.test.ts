import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_STORAGE_KEY, nextTheme, resolveTheme } from "@/lib/theme";

describe("主题解析", () => {
  it("用户选择优先：显式选 light 时，即使系统是暗色也必须尊重（默认暗色不许吃掉用户选择）", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("无记录时默认暗色：系统是亮色也不再回退亮色（本次口径的核心）", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("dark");
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("非法值同样走默认暗色，且与系统偏好无关", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("dark");
    expect(resolveTheme("", false)).toBe("dark");
  });

  it("切换取反：明暗两档可互相切换（默认改了，取反方向不能变）", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  it("存储 key 与内联脚本一致", () => {
    expect(THEME_STORAGE_KEY).toBe("tfb-theme");
  });

  /* 首屏防闪的两处口径必须同源：内联脚本决定 data-theme，resolveTheme 决定 React 初始态。
     若两者对「无记录」的判断分叉，就会出现首屏暗色、接管后跳回亮色。 */
  it("resolveTheme 与首屏内联脚本同口径：无记录/非法 → dark，合法值原样", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    const script = /const themeScript = `([\s\S]*?)`/.exec(src)?.[1] ?? "";
    expect(script).not.toBe("");
    // 不再读系统偏好：'light' 只允许作为「用户显式选浅色」的合法值出现，不得再当回退结果
    expect(script).not.toContain("prefers-color-scheme");
    expect(script).not.toContain("'light':'");
    expect(script).toContain("'dark'");
    // 默认值两边一致
    expect(script).toContain("?m:'dark'");
    expect(DEFAULT_THEME).toBe("dark");
    // 隐私模式抛异常时也必须兜到 dark，而不是让 data-theme 整体缺失
    expect(/catch\(e\)\{[^}]*setAttribute\('data-theme','dark'\)/.test(script)).toBe(true);
  });
});

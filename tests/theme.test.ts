import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, nextTheme, resolveTheme } from "@/lib/theme";

describe("主题解析", () => {
  it("用户选择优先于系统", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
  it("无记录时跟随系统", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });
  it("非法值跟随系统", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
  });
  it("切换取反", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
  it("存储 key 与内联脚本一致", () => {
    expect(THEME_STORAGE_KEY).toBe("tfb-theme");
  });
});

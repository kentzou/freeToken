/** 标签名与顺序是产品事实（原型 934–937），不是实现细节：改名会同时影响验收文档与读屏口径，
 *  所以这里钉逐字。键盘语义钉「循环」与「只一个可聚焦落点」两条 WAI-ARIA Tabs 硬规。 */
import { describe, expect, it } from "vitest";
import { FIRST_TAB, TABS, moveTab, paneAria, pendingBadge, tabAction, tabAria, tabIndex } from "@/lib/admin/tabs";

describe("四标签事实表", () => {
  it("顺序与标签逐字＝原型（待审变更 / 变现配置 / 触发爬取 / 发布历史）", () => {
    expect(TABS.map((t) => `${t.key}:${t.label}`)).toEqual(["review:待审变更", "config:变现配置", "crawl:触发爬取", "history:发布历史"]);
    expect(FIRST_TAB).toBe("review");
  });

  it("tabAria 一次给全 role/selected/controls/tabindex/class，选中项与其余项各成一种", () => {
    expect(tabAria("review", "review", "review")).toEqual({
      id: "tab-review",
      role: "tab",
      "aria-selected": true,
      "aria-controls": "pane-review",
      tabIndex: 0,
      className: "adm-tab on",
    });
    expect(tabAria("crawl", "review", "review")).toEqual({
      id: "tab-crawl",
      role: "tab",
      "aria-selected": false,
      "aria-controls": "pane-crawl",
      tabIndex: -1,
      className: "adm-tab",
    });
  });

  it("roving tabindex：焦点落在哪个标签，哪个才可聚焦（Tab 键因此只会离开整组一次）", () => {
    /* tabIndex(key, focusKey) 的契约是「相等取 0」：焦点在 review 时 0 必落首位，在 history 时必落末位。
       钉两个焦点位置而不是一个——只钉一位时，「写死首个标签永远可聚焦」的假实现也能全绿。 */
    expect(TABS.map((t) => tabIndex(t.key, "review"))).toEqual([0, -1, -1, -1]);
    expect(TABS.map((t) => tabIndex(t.key, "history"))).toEqual([-1, -1, -1, 0]);
    expect(TABS.filter((t) => tabIndex(t.key, "config") === 0).length).toBe(1);
  });

  it("paneAria：非当前面板 hidden=true，且 aria-labelledby 指回自己的标签", () => {
    expect(paneAria("config", "config")).toEqual({ id: "pane-config", role: "tabpanel", "aria-labelledby": "tab-config", hidden: false, className: "adm-pane on" });
    expect(paneAria("history", "config")).toEqual({ id: "pane-history", role: "tabpanel", "aria-labelledby": "tab-history", hidden: true, className: "adm-pane" });
  });

  it("←/→ 循环、Home/End 到两端；认不出的键（含 Tab/Enter）返回 null 不误吞", () => {
    expect(moveTab("review", "prev")).toBe("history");
    expect(moveTab("history", "next")).toBe("review");
    expect(moveTab("review", "last")).toBe("history");
    expect(moveTab("history", "first")).toBe("review");
    expect(tabAction("ArrowRight")).toBe("next");
    expect(tabAction("ArrowLeft")).toBe("prev");
    expect(tabAction("Home")).toBe("first");
    expect(tabAction("End")).toBe("last");
    expect(tabAction("Tab")).toBeNull();
    expect(tabAction("Enter")).toBeNull();
  });

  it("计数徽标：0 不渲染（读屏不该念出「待审变更 0」），3 渲染字符串", () => {
    expect(pendingBadge(0)).toBeNull();
    expect(pendingBadge(3)).toBe("3");
  });
});

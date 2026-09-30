/** 四标签的事实表与键盘语义：纯函数、零 React、零浏览器 API（§1 红线 2）。
 *  为什么键盘语义要抽成 reducer：本站唯一的跑测器是 node 环境 vitest，没有 DOM 事件循环（§3 D1），
 *  把 ←/→/Home/End 写成「状态迁移」才能真断言「从最后一个循环到第一个」，而不是靠肉眼点。
 *  标签名与顺序逐字来自原型 934–937；改一个字都要同步验收文档，组件里不许再写第二份。 */

export type TabKey = "review" | "config" | "crawl" | "history";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "review", label: "待审变更" },
  { key: "config", label: "变现配置" },
  { key: "crawl", label: "触发爬取" },
  { key: "history", label: "发布历史" },
];

/** 默认页＝待审变更：进后台的第一件事是清队列，不是改自己的广告位 */
export const FIRST_TAB: TabKey = "review";

export const isTabKey = (v: unknown): v is TabKey => TABS.some((t) => t.key === v);
export const tabDomId = (key: TabKey) => `tab-${key}`;
export const paneDomId = (key: TabKey) => `pane-${key}`;

/** roving tabindex：整组只留一个可聚焦落点（WAI-ARIA Tabs 模式）。
 *  focusKey 由组件在 onFocus 里报告当前焦点，本层不读页面上的活动元素句柄。 */
export function tabIndex(key: TabKey, focusKey: TabKey): 0 | -1 {
  return key === focusKey ? 0 : -1;
}

/** 标签的 aria 事实一次给全，组件只负责摊成属性（红线 1：不许出现第三处态判断） */
export const tabAria = (key: TabKey, active: TabKey, focusKey: TabKey) => ({
  id: tabDomId(key),
  role: "tab",
  "aria-selected": key === active,
  "aria-controls": paneDomId(key),
  tabIndex: tabIndex(key, focusKey),
  className: `adm-tab${key === active ? " on" : ""}`,
});

export const paneAria = (key: TabKey, active: TabKey) => ({
  id: paneDomId(key),
  role: "tabpanel",
  "aria-labelledby": tabDomId(key),
  hidden: key !== active,
  className: `adm-pane${key === active ? " on" : ""}`,
});

export type TabAction = "next" | "prev" | "first" | "last";

/** ←/→ 循环而非到端截断：原型 JS 1316–1322 就是这个口径，四个标签循环零代价，
 *  截断会让「发布历史」只能用鼠标点。 */
export function moveTab(active: TabKey, action: TabAction): TabKey {
  const n = TABS.length;
  const i = TABS.findIndex((t) => t.key === active);
  const j = action === "next" ? (i + 1) % n : action === "prev" ? (i - 1 + n) % n : action === "first" ? 0 : n - 1;
  return TABS[j].key;
}

const ACTION_BY_KEY: Record<string, TabAction> = { ArrowRight: "next", ArrowLeft: "prev", Home: "first", End: "last" };

/** 键盘事件 → 动作；认不出的键返回 null，组件据此决定是否 preventDefault（绝不吞 Tab/Enter） */
export const tabAction = (key: string): TabAction | null => ACTION_BY_KEY[key] ?? null;

/** 计数徽标：0 返回 null（不渲染），原型 934 的 #pendingN 只在有队列时才有意义 */
export const pendingBadge = (count: number): string | null => (count > 0 ? String(count) : null);

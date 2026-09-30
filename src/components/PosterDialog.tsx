"use client";

import { useEffect, useRef } from "react";

/** 弹窗内可聚焦元素集合（一次查询即可，无需排序——DOM 顺序就是 Tab 顺序） */
const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** 海报弹窗：磨砂遮罩 + Tab 焦点圈定 + 关闭后焦点归还 + Esc/点遮罩关闭。
 *  如实声明：data/tokens.json 现无任何 http poster，本弹窗在现数据面不可达；
 *  这里的键盘契约按「上游一旦给出 http 海报即上线」维护。 */
export default function PosterDialog({
  src,
  name,
  onClose,
}: {
  src: string | null;
  name: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /* 调用方传的是行内箭头函数（`HomeClient.tsx:146` 的 `onClose={() => setPoster(null)}`），
     身份每次渲染都变。写进 effect 依赖会让清理函数在弹窗打开期间**每次重渲染都跑一遍**——
     焦点归还把用户从弹窗里踢回触发按钮，键盘操作在搜索框一敲字就断。
     故用 ref 兜最新值，effect 只按 src 重启（React 官方推荐的 latest-ref 形态）。 */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!src) return;
    /* 打开瞬间的焦点元素（触发按钮）就是关闭后该回到的位置。
       不还就会把键盘用户扔回 body，关闭一次弹窗要从头再按一遍 Tab。 */
    const opener = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const node = box.current;
      if (!node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      /* 容器自身（tabIndex=-1）是打开后的落点，它不在 items 里；连同「焦点已漏到弹窗外」
         一起当作边缘处理，直接拉回边界。少了这一支，容器上按 Tab 会交给浏览器默认行为，
         焦点顺着文档顺序跑到弹窗背后的页面元素上——陷阱漏了。 */
      if (active === node || !node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      /* 关闭时触发按钮可能已被重渲染替换，contains 判断避免对脱链节点空 Focus */
      if (opener && document.contains(opener)) opener.focus();
    };
    /* 依赖只有 src：closeRef/box 是 ref，天然稳定 */
  }, [src]);

  if (!src) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={box}
        className="poster-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 海报`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 尺寸交给 CSS（app.css 的 .poster-dialog img 容器内约束）：
            海报宽高由上游决定，这里写死数字就是把假值写进产物。 */}
        <img src={src} alt={`${name} 活动海报`} decoding="async" />
        <button className="btn-ghost poster-close" type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}

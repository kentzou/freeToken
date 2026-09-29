"use client";

import { useEffect, useRef } from "react";

/** 海报弹窗：磨砂遮罩 + 焦点圈定 + Esc/点遮罩关闭 */
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

  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [src, onClose]);

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
        <img src={src} alt={`${name} 活动海报`} />
        <button className="btn-ghost poster-close" type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  );
}

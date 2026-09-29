"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 复制 + 1.6s 自动收起的 Toast 文案；失败保留错误提示不静默 */
export function useCopy() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => setMessage(null), []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("已复制");
    } catch {
      setMessage("复制失败，请手动选择文本");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 1600);
    return true;
  }, []);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return { copy, message, clear };
}

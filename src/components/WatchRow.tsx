import { cleanText } from "@/lib/copy";
import type { WatchItem } from "@/lib/types";

/** 观望名单行：虚线边框降权，不伪装成推荐 */
export default function WatchRow({ item }: { item: WatchItem }) {
  return (
    <article className="watch-row">
      <strong>{cleanText(item.name)}</strong>
      <p>{cleanText(item.why)}</p>
      <a href={item.link} target="_blank" rel="noopener noreferrer">
        查看平台
      </a>
    </article>
  );
}

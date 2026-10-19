import { pageHref } from "@/lib/href";
import { linkRel } from "@/lib/copy";

/** 副动作（card.extraAction）落地，卡片与详情页共用同一实现：
 *  站内相对路径（/openrouter/）经 pageHref 补 BASE 后同页打开，http(s) 外链原样并新开窗口。
 *  相对/外链的判断只此一处，别的组件不得再拼一遍。外链的 rel 走 linkRel（与主按钮同一份推广判据，
 *  自营活动短链挂在副按钮上时同样要标 sponsored，公开口径在 /editorial-policy）。className 由调用方给
 *  （卡片 card-action、详情页 btn-ghost）。 */
export default function SubAction({
  link,
  text,
  className = "card-action",
}: {
  link: string;
  text: string;
  className?: string;
}) {
  const external = /^https?:\/\//i.test(link);
  return external ? (
    <a className={className} href={link} target="_blank" rel={linkRel(link)}>
      {text}
    </a>
  ) : (
    <a className={className} href={pageHref(link)}>
      {text}
    </a>
  );
}

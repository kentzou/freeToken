import type { CompiledRules } from "./rules";
import type { TokenCard } from "./types";
import { detailSlug } from "./copy";

/** 站内路径的唯一出口：本地开发 BASE 为空串；GitHub Pages 子路径部署时构建期传
 *  NEXT_PUBLIC_BASE_PATH=/token-fbi-next，所有内部链接与资源自动带前缀（计划 2 无需再改组件）。 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** 详情页路径，与 app/intel/[slug] 的 generateStaticParams 同源，杜绝两边漂移 */
export function intelHref(card: TokenCard, rules: CompiledRules): string {
  return pageHref(`/intel/${detailSlug(card.name, rules)}/`);
}

/** 内部页面链接：/about → <BASE>/about/（trailingSlash:true 的规范形态：补尾斜杠、去重复斜杠；
 *  根路径例外保持 <BASE>/，资源路径见 assetPath——绝不带尾斜杠） */
export function pageHref(path: string): string {
  const p = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${BASE}/${p}${p ? "/" : ""}`;
}

/** 静态资源：assets/logos/x.png → <BASE>/assets/logos/x.png（外链原样返回）。
 *  独立拼 BASE，不经 pageHref——资源名可能以 / 结尾，绝不能被补成目录尾斜杠。 */
export function assetPath(rel: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${BASE}/${rel.replace(/^\.?\/+/, "")}`;
}

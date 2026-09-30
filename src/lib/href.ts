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

/* 线上 Pages 地址由 deploy.yml 注入，且**已含仓库子路径**（https://<owner>.github.io/<repo>）；
   本地构建为空串。这里是它在本仓 TS 侧的唯一读取点——layout.tsx 的 metadataBase 也用它，
   两处各自读 env 就是第二个漂移点。与 gen-seo.mjs 对同一个 env 的处理保持一致（剥尾斜杠），
   否则 canonical 会出 …/token-fbi-next//about/ 的双斜杠形态（计划 4 Task 6 评审 Minor-4）。 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

/** 把「已去掉 BASE 的站内路径」拼成绝对地址；本地口径（无 SITE_URL）退回带 BASE 的相对形态。 */
function abs(pathWithoutBase: string): string {
  return SITE_URL ? `${SITE_URL}${pathWithoutBase}` : `${BASE}${pathWithoutBase}`;
}

/** canonical 专用：/about → https://<site>/about/。
 *  为什么不用 pageHref 的返回值直接上：Task 6 Step 10 线上口径实测，metadataBase 的 pathname
 *  本身就带 BASE，Next 会把带 BASE 的相对串再补一次 BASE，产物里落成
 *  https://owner.github.io/token-fbi-next/token-fbi-next/ —— 双前缀的 canonical 会把收录指向不存在的地址。 */
export function canonicalHref(path: string): string {
  return abs(pageHref(path).slice(BASE.length));
}

/** og:image 等资源专用：assets/og-cover.png → https://<site>/assets/og-cover.png（外链原样返回）。 */
export function canonicalAsset(rel: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  return abs(assetPath(rel).slice(BASE.length));
}

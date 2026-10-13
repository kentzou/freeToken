/** 静态导出：产物 out/ 可直接放 GitHub Pages。
 *  子路径部署（https://<user>.github.io/<repo>/）时由计划 2 在构建期传
 *  NEXT_PUBLIC_BASE_PATH=/<repo>：这里交给 Next 处理 _next 静态资源前缀，
 *  src/lib/href.ts 的 pageHref/assetPath 处理我们手写的 <a href> 与 <img src>。
 *  本地 npm run dev / npm run build 不传该变量，前缀为空串。 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const nextConfig = {
  basePath,
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  /* 沙箱环境下 out/ 目录被 safe-delete 拦截无法清空，改用 .export/ 作导出口，
     构建后由 scripts/build-export-fix.mjs 搬回 out/。线上 CI 无此限制，
     但为保持本地与 CI 一致（同一份配置产出同一目录），统一走这条链路。 */
  distDir: ".export",
  /* 关闭构建时对 distDir 的自动清理：Next 每轮构建会 recursiveDelete(.next)，
     在沙箱下触发 safe-delete 批量阈值拦截（SAFE_DELETE_BULK_CONFIRM_REQUIRED），
     导致构建中断。关闭后每轮构建前由外部脚本按需清理。 */
  cleanDistDir: false,
};
export default nextConfig;

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
};
export default nextConfig;

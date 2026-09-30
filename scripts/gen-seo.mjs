/** 构建后生成抓取面资产：out/robots.txt + out/sitemap.xml（npm run seo，在 npm run build 之后跑）。
 *  为什么不放 public/ 也不入库：locs 必须是「这次构建真的产出了这一页」，而 sitemap 的 loc 必须是
 *  带域名的绝对地址——把某个环境的域名固化进仓库，下一次换地址就是一条失效声明。
 *  SITE_URL 由 deploy.yml 注入，且已含仓库子路径（https://<owner>.github.io/<repo>），
 *  所以 loc = SITE_URL + 相对 out/ 的目录路径，不再叠加 NEXT_PUBLIC_BASE_PATH。 */
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 不进 sitemap 的目录：404 是错误页；admin 是计划 3 的写侧入口（若已上线，绝不能被索引）。 */
const NO_INDEX = ["404", "admin"];

/** htmlFiles：相对 out/ 的 index.html 路径（正斜杠）。返回升序的绝对 loc 列表；无站点地址返回空表。 */
export function locsFromHtml(htmlFiles, siteUrl) {
  const base = (siteUrl || "").replace(/\/+$/, "");
  if (!base) return [];
  const locs = [];
  for (const rel of htmlFiles) {
    const p = rel.split("\\").join("/");
    if (!p.endsWith("index.html") || p.startsWith("_next/")) continue;
    const dir = p.slice(0, -"index.html".length); // "" 或 "intel/cline/"
    const top = dir.split("/")[0];
    if (NO_INDEX.includes(top)) continue;
    locs.push(`${base}/${dir}`);
  }
  return locs.sort();
}

/** robots.txt 全文。无站点地址时不写 Sitemap 行，也绝不塞占位域名。 */
export function robotsTxt(siteUrl) {
  const base = (siteUrl || "").replace(/\/+$/, "");
  const lines = ["User-agent: *", "Allow: /"];
  if (base) lines.push("", `Sitemap: ${base}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

function walkIndexHtml(dir, prefix = "") {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walkIndexHtml(full, `${prefix}${name}/`));
    else if (name === "index.html") found.push(`${prefix}index.html`);
  }
  return found;
}

export function writeSeo(outDir, siteUrl) {
  const locs = locsFromHtml(walkIndexHtml(outDir), siteUrl);
  writeFileSync(path.join(outDir, "robots.txt"), robotsTxt(siteUrl), "utf8");
  if (!locs.length) return 0;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${locs.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  writeFileSync(path.join(outDir, "sitemap.xml"), xml, "utf8");
  return locs.length;
}

/* CLI 判定沿用 scripts/export-seed.mjs:110 的写法：Windows 反斜杠 argv[1] 同样命中 */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outDir = path.resolve(process.cwd(), "out");
  if (!existsSync(outDir)) {
    console.error("[seo] 缺 out/：先跑 npm run build");
    process.exit(1);
  }
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const n = writeSeo(outDir, envUrl);
  console.log(`[seo] robots.txt 已出；${envUrl ? `sitemap.xml ${n} 条` : "无 NEXT_PUBLIC_SITE_URL，按本地口径跳过 sitemap"}`);
}

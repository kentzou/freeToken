/** 构建后生成抓取面资产：out/robots.txt + out/sitemap.xml（npm run seo，在 npm run build 之后跑）。
 *  为什么不放 public/ 也不入库：locs 必须是「这次构建真的产出了这一页」，而 sitemap 的 loc 必须是
 *  带域名的绝对地址——把某个环境的域名固化进仓库，下一次换地址就是一条失效声明。
 *  SITE_URL 由 deploy.yml 注入，且已含仓库子路径（https://<owner>.github.io/<repo>），
 *  所以 loc = SITE_URL + 相对 out/ 的目录路径，不再叠加 NEXT_PUBLIC_BASE_PATH。 */
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/** 部署口径的取值（唯一实现，tests/build-output.test.mjs 复用同一个函数，杜绝「产物按 A 口径生成、检查按 B 口径判定」）。
 *  空/缺省＝primary；未知值就地抛错——静默回落成 primary 就会把镜像当主站发出去，正是这次要防的事故形态。
 *  与 src/lib/siteRole.ts 里的同名校验必须逐条一致：那是页面侧（meta robots）与链接形态，这里是抓取面侧（robots/sitemap）。 */
export function roleOf(raw) {
  const v = (raw ?? "").trim();
  if (v !== "" && v !== "primary" && v !== "mirror") {
    throw new Error(`NEXT_PUBLIC_SITE_ROLE 只接受 primary|mirror，收到 ${JSON.stringify(raw)}`);
  }
  return v === "mirror" ? "mirror" : "primary";
}

/** 站点角色是否供给 sitemap。primary（含缺省）＝主站，sitemap 与页面同源；
 *  mirror＝镜像站，页面 canonical 指主站，但绝不能在自家主机上放一份「loc 全是别人地址」的
 *  sitemap——按 sitemaps.org，loc 必须与 sitemap 文件所在主机同源，跨主机需另行验证才生效，
 *  静默无效比 404 更难发现。缺省必须是主站口径：镜像是显式选择的部署形态，不该由它改默认行为。 */
export function publishesSitemap(role) {
  return role !== "mirror";
}

/** robots.txt 全文。无站点地址时不写 Sitemap 行，也绝不塞占位域名；镜像口径同样不写。 */
export function robotsTxt(siteUrl, role) {
  const base = (siteUrl || "").replace(/\/+$/, "");
  const lines = ["User-agent: *", "Allow: /"];
  if (base && publishesSitemap(role)) lines.push("", `Sitemap: ${base}/sitemap.xml`);
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

export function writeSeo(outDir, siteUrl, role) {
  writeFileSync(path.join(outDir, "robots.txt"), robotsTxt(siteUrl, role), "utf8");
  if (!publishesSitemap(role)) {
    /* 残留比缺失更难发现：只重跑 seo 而不清 out/ 时（换口径重发就会这样），上一轮主站那份
       「loc 全是别人地址」的 sitemap.xml 还在磁盘上——robots 不声明它，不等于爬虫猜不到它。
       force: true 让「本来就没有」也算成功，不额外 existsSync 一轮。 */
    rmSync(path.join(outDir, "sitemap.xml"), { force: true });
    return 0;
  }
  const locs = locsFromHtml(walkIndexHtml(outDir), siteUrl);
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
  /* 口径变量与 src/lib/siteRole.ts 读的是同一个（NEXT_PUBLIC_ 前缀，好让浏览器包里的
     链接改造与服务端口径同源）；两处取值必须一致：
     这里若放宽成「未知值按 primary」，就会出现「页面 meta 说 noindex、robots.txt 却供 sitemap」的镜像。 */
  let role;
  try {
    role = roleOf(process.env.NEXT_PUBLIC_SITE_ROLE);
  } catch (e) {
    console.error(`[seo] ${e.message}`);
    process.exit(1);
  }
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const n = writeSeo(outDir, envUrl, role);
  console.log(
    `[seo] robots.txt 已出（${role}）；` +
      (role === "mirror"
        ? "镜像口径不供 sitemap"
        : envUrl
          ? `sitemap.xml ${n} 条`
          : "无 NEXT_PUBLIC_SITE_URL，按本地口径跳过 sitemap")
  );
}

/** 导航爬虫编排器。
 *  职责：遍历启用的来源站 adapter → 汇总 RawTool → 写 data/raw/<site>.json + 汇总报告。
 *  不含解析逻辑（属 adapter）、不含清洗（属 pipeline），保持单一职责。
 *  用法：node crawler/nav/run.mjs [--site aibot] [--dry] */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NAV_SITES, enabledSites } from "./sites.mjs";

const ROOT = path.resolve(process.cwd());
const RAW_DIR = path.join(ROOT, "data", "raw");

/** 动态载入 adapter（按 site.id / adapters/<id>.mjs）。缺失则不视为错误，记 skipped。 */
async function loadAdapter(id) {
  const p = path.join(ROOT, "crawler", "nav", "adapters", `${id}.mjs`);
  if (!existsSync(p)) return null;
  const mod = await import(pathToFileURL(p).href);
  if (typeof mod.fetchList !== "function") return null;
  return mod;
}

/** 抓单个站，返回 { siteId, ok, count, error, tools }。任何异常都被收敛为 ok:false。 */
export async function crawlSite(site, fetchedAt) {
  const adapter = await loadAdapter(site.id);
  if (!adapter) {
    return { siteId: site.id, ok: false, count: 0, error: "adapter 未实现", tools: [] };
  }
  try {
    const r = await adapter.fetchList(site, fetchedAt);
    return { siteId: site.id, ok: r.ok, count: r.tools.length, error: r.error || "", tools: r.tools };
  } catch (e) {
    return { siteId: site.id, ok: false, count: 0, error: String(e?.message || e), tools: [] };
  }
}

/** 主流程：串行抓取（限速已由 http 层按域控制，串行避免并发压垮小站）。 */
export async function runAll({ only = [], dry = false } = {}) {
  const fetchedAt = new Date().toISOString();
  const sites = enabledSites().filter((s) => !only.length || only.includes(s.id));
  const results = [];

  if (!dry) mkdirSync(RAW_DIR, { recursive: true });

  for (const site of sites) {
    process.stdout.write(`→ 抓取 ${site.name} (${site.home}) … `);
    const r = await crawlSite(site, fetchedAt);
    results.push({ site, ...r });

    if (r.ok && !dry) {
      const file = path.join(RAW_DIR, `${site.id}.json`);
      writeFileSync(
        file,
        JSON.stringify({ siteId: site.id, siteName: site.name, fetchedAt, count: r.count, tools: r.tools }, null, 2) + "\n"
      );
    }
    console.log(r.ok ? `OK ${r.count} 条` : `失败：${r.error}`);
  }

  // 报告：成功站 + 跳过站（含原因），保证来源页可如实展示
  const report = {
    fetchedAt,
    crawled: results.map((r) => ({ siteId: r.siteId, name: r.site.name, ok: r.ok, count: r.count, error: r.error })),
    skipped: NAV_SITES.filter((s) => !s.enabled).map((s) => ({
      siteId: s.id, name: s.name, home: s.home, reason: s.skipReason || "未启用",
    })),
    total: results.reduce((n, r) => n + r.count, 0),
  };
  if (!dry) {
    writeFileSync(path.join(RAW_DIR, "_report.json"), JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}

/** CLI 入口 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const only = args.includes("--site") ? [args[args.indexOf("--site") + 1]] : [];
  const dry = args.includes("--dry");
  const rep = await runAll({ only, dry });
  console.log(`\n汇总：${rep.crawled.filter((c) => c.ok).length} 站成功，共 ${rep.total} 条；跳过 ${rep.skipped.length} 站。`);
}

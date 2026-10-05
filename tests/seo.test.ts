import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { locsFromHtml, publishesSitemap, robotsTxt, roleOf, writeSeo } from "../scripts/gen-seo.mjs";

const SITE = "https://owner.github.io/token-fbi-next";

describe("locsFromHtml：sitemap 只收录真实存在的页面", () => {
  /* 与 out/ 同构的路径清单（相对 out/，正斜杠）：首页 1 + 内容页 4 + 详情页 2 + 404 两份 */
  const files = [
    "index.html",
    "about/index.html",
    "contact/index.html",
    "editorial-policy/index.html",
    "privacy/index.html",
    "intel/cline/index.html",
    "intel/stepfun-stepfun/index.html",
    "404/index.html",
    "404.html",
  ];
  const locs = locsFromHtml(files, SITE);

  it("404 与非页面产物不入 sitemap，其余目录即路由且带尾斜杠", () => {
    expect(locs).toEqual([
      `${SITE}/`,
      `${SITE}/about/`,
      `${SITE}/contact/`,
      `${SITE}/editorial-policy/`,
      `${SITE}/intel/cline/`,
      `${SITE}/intel/stepfun-stepfun/`,
      `${SITE}/privacy/`,
    ]);
  });

  it("无站点地址（本地口径构建）时一条都不出——绝不写相对 loc", () => {
    expect(locsFromHtml(files, "")).toEqual([]);
  });
});

describe("robotsTxt：有站点地址才声明 Sitemap", () => {
  it("空 SITE_URL 只给抓取范围，不留占位域名", () => {
    expect(robotsTxt("")).toBe("User-agent: *\nAllow: /\n");
  });

  it("有 SITE_URL 时补 sitemap 绝对地址，且末尾斜杠不重复", () => {
    expect(robotsTxt(`${SITE}/`)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robotsTxt(SITE)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});

/* 镜像口径（任务 #54）：副本站的 canonical 指主站，但绝不能在自家主机上放一份
   「loc 全是别人地址」的 sitemap——sitemap 的 loc 必须与 sitemap 文件所在主机同源，
   跨主机的 sitemap 按 sitemaps.org 规范需要另行验证才生效，静默无效比 404 更难发现。 */
describe("镜像口径：不供跨主机的抓取面", () => {
  it("publishesSitemap：默认与 primary 出 sitemap，mirror 不出", () => {
    expect(publishesSitemap("primary")).toBe(true);
    expect(publishesSitemap("mirror")).toBe(false);
    // deploy.yml 不设 NEXT_PUBLIC_SITE_ROLE，缺省必须还是主站口径——不能让镜像决定默认行为
    expect(publishesSitemap(undefined)).toBe(true);
  });

  /* roleOf 是抓取面与产物自检共用的取值口径（tests/build-output.test.mjs import 同一个函数）。
     未知值必须抛：静默回落 primary，就是把镜像当主站发出去——那条 26 条 404 的成因形态。 */
  it("roleOf：空/缺省/primary 都算主站，mirror 才算镜像，其余一律抛错", () => {
    expect(roleOf(undefined)).toBe("primary");
    expect(roleOf("")).toBe("primary");
    expect(roleOf("  primary ")).toBe("primary");
    expect(roleOf("mirror")).toBe("mirror");
    expect(() => roleOf("Mirror")).toThrow(/SITE_ROLE/);
    expect(() => roleOf("miror")).toThrow(/SITE_ROLE/);
  });

  it("robotsTxt：mirror 口径下只有抓取范围，没有 Sitemap 行", () => {
    expect(robotsTxt(SITE, "mirror")).toBe("User-agent: *\nAllow: /\n");
  });

  /* 残留比缺失更难发现：同一份 out/ 先按主站跑过 seo、再按镜像跑一次（换口径重发时手工就会这么干），
     上一轮那份「loc 全是别人地址」的 sitemap.xml 还躺在磁盘上，而 robots.txt 已经不声明它了——
     爬虫仍能从旧 URL 结构猜到 /sitemap.xml。镜像口径下这一步必须把它删掉。 */
  it("writeSeo：mirror 口径会把上一轮 primary 留下的 sitemap.xml 删掉，不留跨主机清单", () => {
    const dir = mkdtempSync(join(tmpdir(), "tfb-seo-stale-"));
    try {
      mkdirSync(join(dir, "about"), { recursive: true });
      writeFileSync(join(dir, "index.html"), "<html></html>", "utf8");
      writeFileSync(join(dir, "about", "index.html"), "<html></html>", "utf8");
      expect(writeSeo(dir, SITE, "primary")).toBe(2);
      expect(existsSync(join(dir, "sitemap.xml"))).toBe(true);
      expect(writeSeo(dir, SITE, "mirror")).toBe(0);
      expect(existsSync(join(dir, "sitemap.xml"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writeSeo：mirror 只落 robots.txt，磁盘上不出现 sitemap.xml；同一清单在 primary 下必须出现", () => {
    const dir = mkdtempSync(join(tmpdir(), "tfb-seo-"));
    try {
      for (const rel of ["index.html", "about/index.html"]) {
        mkdirSync(dirname(join(dir, rel)), { recursive: true });
        writeFileSync(join(dir, rel), "<html></html>", "utf8");
      }
      expect(writeSeo(dir, SITE, "mirror")).toBe(0);
      expect(existsSync(join(dir, "sitemap.xml"))).toBe(false);
      expect(readFileSync(join(dir, "robots.txt"), "utf8")).toBe("User-agent: *\nAllow: /\n");
      expect(writeSeo(dir, SITE, "primary")).toBe(2);
      expect(readFileSync(join(dir, "sitemap.xml"), "utf8")).toContain(`<loc>${SITE}/about/</loc>`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

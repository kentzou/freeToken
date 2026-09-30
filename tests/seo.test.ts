import { describe, expect, it } from "vitest";
import { locsFromHtml, robotsTxt } from "../scripts/gen-seo.mjs";

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

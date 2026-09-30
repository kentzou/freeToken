import { describe, expect, it, vi } from "vitest";
import { assetPath, canonicalAsset, canonicalHref, intelHref, pageHref } from "@/lib/href";
import { compiledRules } from "@/lib/rules";
import { readFileSync } from "node:fs";
import path from "node:path";

/* vitest 环境不注入 NEXT_PUBLIC_BASE_PATH，因此 BASE 为空串——
   这正是本地 npm run dev / npm run build 的取值；Pages 前缀由计划 2 在构建期注入。 */
describe("路径出口", () => {
  it("pageHref 归一化为「前导+单个尾随」斜杠（trailingSlash:true），根路径保持 /", () => {
    expect(pageHref("/about/")).toBe("/about/");
    expect(pageHref("about")).toBe("/about/");
    expect(pageHref("/")).toBe("/");
  });

  it("assetPath 把 public 资源变为站内绝对路径（永不补尾斜杠），外链原样放行", () => {
    expect(assetPath("assets/logos/workbuddy-official.png")).toBe("/assets/logos/workbuddy-official.png");
    expect(assetPath("./assets/logos/tencent.png")).toBe("/assets/logos/tencent.png");
    expect(assetPath("https://hunyuan.tencent.com/")).toBe("https://hunyuan.tencent.com/");
  });

  it("intelHref 与详情页 generateStaticParams 使用同一个 slug 函数", () => {
    const rules = compiledRules(
      JSON.parse(readFileSync(path.resolve(process.cwd(), "data/rules.json"), "utf8"))
    );
    const card = { name: "WorkBuddy", type: "大模型", updated: "2026-09-23" };
    expect(intelHref(card as never, rules)).toBe("/intel/workbuddy/");
  });

  it("本地口径（无 SITE_URL）canonical 保持带 BASE 的相对形态，不出绝对地址", () => {
    expect(canonicalHref("/about")).toBe("/about/");
    expect(canonicalAsset("assets/og-cover.png")).toBe("/assets/og-cover.png");
  });

  /* 线上口径要换一份模块实例：BASE / SITE_URL 是构建期常量，模块加载时读一次就定终身。
     这条钉的是 Task 6 Step 10 实测到的缺陷本身——metadataBase 的 pathname 已含 BASE，
     canonical 若再把带 BASE 的相对串交给 Next，产物就落成 …/token-fbi-next/token-fbi-next/。 */
  it("线上口径（BASE 与 SITE_URL 同含子路径）canonical 不得叠出双前缀", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_BASE_PATH = "/token-fbi-next";
    process.env.NEXT_PUBLIC_SITE_URL = "https://owner.github.io/token-fbi-next";
    const m = await import("@/lib/href");
    expect(m.pageHref("/about")).toBe("/token-fbi-next/about/"); // 站内链接照旧带 BASE
    expect(m.canonicalHref("/about")).toBe("https://owner.github.io/token-fbi-next/about/");
    expect(m.canonicalHref("/")).toBe("https://owner.github.io/token-fbi-next/");
    expect(m.canonicalAsset("assets/og-cover.png")).toBe("https://owner.github.io/token-fbi-next/assets/og-cover.png");
    expect(m.canonicalAsset("https://example.com/x.png")).toBe("https://example.com/x.png");
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();
  });

  /* deploy.yml 注入的地址若带尾斜杠，而 gen-seo.mjs 对同一个 env 是剥尾斜杠的——
     href.ts 不剥就会产出 …/token-fbi-next//about/ 这种双斜杠 canonical，与 sitemap 的
     loc 两个口径不一致（计划 4 Task 6 评审 Minor-4，评审人直跑复现）。 */
  it("SITE_URL 带尾斜杠时按 gen-seo 同口径剥掉，不叠双斜杠", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_BASE_PATH = "/token-fbi-next";
    process.env.NEXT_PUBLIC_SITE_URL = "https://owner.github.io/token-fbi-next/";
    const m = await import("@/lib/href");
    expect(m.canonicalHref("/about")).toBe("https://owner.github.io/token-fbi-next/about/");
    expect(m.canonicalAsset("assets/og-cover.png")).toBe("https://owner.github.io/token-fbi-next/assets/og-cover.png");
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.resetModules();
  });
});

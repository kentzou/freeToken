import { describe, expect, it } from "vitest";
import { assetPath, intelHref, pageHref } from "@/lib/href";
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
});

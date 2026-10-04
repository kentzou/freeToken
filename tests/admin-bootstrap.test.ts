/** D4：/admin 要在「读 config 之前」就知道仓名，而 config 自己就在那个仓里——这是个鸡生蛋问题，
 *  答案只能是构建期注入（NEXT_PUBLIC_SITE_URL 由 deploy.yml 给，href.ts 的 canonical 已经依赖它）。
 *  这里不测组件，只测三级取值的顺序与退化：退化必须是空串（＝不可用），绝不返回猜出来的仓名。 */
import { describe, expect, it } from "vitest";
import { bootstrapRepo, deriveRepo, repoMismatch } from "@/lib/admin/bootstrap";

describe("后台寻址 bootstrap", () => {
  it("Pages 标准地址反推 owner/repo（含尾斜杠与多级子路径的容错）", () => {
    expect(deriveRepo("https://hope0719.github.io/token-fbi-next/")).toBe("hope0719/token-fbi-next");
    expect(deriveRepo("https://hope0719.github.io/token-fbi-next")).toBe("hope0719/token-fbi-next");
  });
  it("认不出来的地址一律空串：自定义域、根域站点、空值都不是「可写目标」", () => {
    expect(deriveRepo("https://tokens.example.com/")).toBe("");
    expect(deriveRepo("https://hope0719.github.io/")).toBe("");
    expect(deriveRepo("")).toBe("");
    expect(deriveRepo("不是地址")).toBe("");
  });
  it("NEXT_PUBLIC_REPO 显式覆盖优先于 SITE_URL 反推（自定义域场景的唯一出路）", () => {
    process.env.NEXT_PUBLIC_REPO = "someone/else";
    process.env.NEXT_PUBLIC_SITE_URL = "https://hope0719.github.io/token-fbi-next/";
    expect(bootstrapRepo()).toBe("someone/else");
    delete process.env.NEXT_PUBLIC_REPO;
    expect(bootstrapRepo()).toBe("hope0719/token-fbi-next");
  });
  it("两个变量都没有 → 空串，UI 走 noRepo 引导态而不是拿空仓名发请求", () => {
    delete process.env.NEXT_PUBLIC_REPO;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(bootstrapRepo()).toBe("");
  });
  it("config.githubRepo 与构建期寻址不一致时报出来（写错仓的代价是提交落到别处）", () => {
    expect(repoMismatch("a/b", "a/b")).toBe("");
    expect(repoMismatch("a/b", "c/d")).toContain("构建期为 a/b");
    expect(repoMismatch("", "c/d")).toBe(""); // 构建期没值时以 config 为准，不算冲突
  });
});

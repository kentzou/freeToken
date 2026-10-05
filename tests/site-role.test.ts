import { afterEach, describe, expect, it, vi } from "vitest";

/* SITE_ROLE 是构建期常量（模块加载时读一次就定终身），所以每种口径都要重开一个模块实例——
   与 tests/href.test.ts 同一手法。这条围栏要存在的理由：镜像那次事故就是「同一份产物被放到
   另一个主机上、而产物里的绝对地址没有跟着变」，口径必须显式声明、拼错必须当场红。 */
const load = async (role?: string) => {
  vi.resetModules();
  if (role === undefined) delete process.env.SITE_ROLE;
  else process.env.SITE_ROLE = role;
  const m = await import("@/lib/siteRole");
  return { role: m.SITE_ROLE as string, robots: m.ROBOTS_META };
};

afterEach(() => {
  delete process.env.SITE_ROLE;
  vi.resetModules();
});

describe("SITE_ROLE：只有 primary 与 mirror 两种口径", () => {
  it("默认（不设变量）＝primary，且不写 meta robots", async () => {
    const { role, robots } = await load();
    expect(role).toBe("primary");
    expect(robots).toBeUndefined();
  });

  it("空串回落到 primary（与本仓 NEXT_PUBLIC_* 的既有取值口径一致）", async () => {
    const { role } = await load("");
    expect(role).toBe("primary");
  });

  it("mirror＝不进索引、但允许顺链抓取，好让爬虫同时看见 canonical", async () => {
    const { role, robots } = await load("mirror");
    expect(role).toBe("mirror");
    expect(robots).toEqual({ index: false, follow: true });
  });

  it("拼错就地抛错——静默按主站出产物，正是要防的那类事故", async () => {
    await expect(load("Mirror")).rejects.toThrow(/SITE_ROLE/);
    await expect(load("miror")).rejects.toThrow(/SITE_ROLE/);
  });
});

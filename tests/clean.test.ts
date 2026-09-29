import { describe, expect, it, vi } from "vitest";
import { applySiteConfig, cleanCard, linkRisk, stripPromoParams } from "../crawler/clean.mjs";

describe("stripPromoParams（期望值 = 对真实镜像跑出的实测结果）", () => {
  it.each([
    ["https://www.aliyun.com/product/lingma?userCode=ygtxup80", "https://www.aliyun.com/product/lingma"],
    ["https://chat.b.ai/chat?invite_code=CQLBPC", "https://chat.b.ai/chat"],
    ["https://www.miaoda.cn/?invitecode=user-7a0wz6474m4k", "https://www.miaoda.cn/"],
    ["https://monkeycode-ai.com/?ic=019fe974-4b9e-7186-b8a6-2901baec7c2e", "https://monkeycode-ai.com/"],
    ["https://x.com/a?invite_code_v2=ABC&utm_source=y", "https://x.com/a"],
    ["https://x.com/a?aff=123&keyfrom=wap", "https://x.com/a"],
    // hash 内参数：SPA 把邀请码放在 #/index?keyfrom=…，只清 search 会漏
    ["https://lobsterai.youdao.com/#/index?keyfrom=invitation", "https://lobsterai.youdao.com/#/index"],
    // 业务参数必须留下
    ["https://a.test/p?userCode=x&id=9", "https://a.test/p?id=9"],
    ["https://contest.weixin.qq.com/eventDetails?id=4598379302114656257&from=share", "https://contest.weixin.qq.com/eventDetails?id=4598379302114656257"],
  ])("%s → %s", (raw, want) => {
    expect(stripPromoParams(raw)).toBe(want);
  });
  it("无参数链接逐字节原样返回（URL 归一化会凭空补尾斜杠，不许污染干净链接）", () => {
    for (const u of ["https://lanbuff.app", "https://cline.bot", "https://openrouter.ai"]) {
      expect(stripPromoParams(u)).toBe(u);
    }
  });
  it("非法 URL 不抛错，返回原值", () => {
    expect(stripPromoParams("#")).toBe("#");
  });
});

describe("linkRisk", () => {
  it("抓到正则清不掉的路径型推广短链", () => {
    expect(linkRisk("https://s.mi.cn/NNI4kZp9")).toBe("推广短链域名 s.mi.cn");
    expect(linkRisk("https://curl.qcloud.com/8dvDMEyi")).toContain("curl.qcloud.com");
  });
  it("抓到漏洗的引流参数（含 hash 内）", () => {
    expect(linkRisk("https://a.test/p?userCode=x")).toContain("残留引流参数 userCode");
    expect(linkRisk("https://a.test/#/index?keyfrom=invitation")).toContain("残留引流参数 keyfrom");
  });
  it("干净链接与占位符返回 null", () => {
    expect(linkRisk("https://cline.bot")).toBeNull();
    expect(linkRisk("#")).toBeNull();
    expect(linkRisk(undefined)).toBeNull();
  });
});

describe("cleanCard", () => {
  it("清洗链接并置空上游邀请码池/trae 池/原作者海报", () => {
    const out = cleanCard({
      name: "阿里云 Qoder（灵码）",
      link: "https://www.aliyun.com/product/lingma?userCode=ygtxup80",
      inviteBase: "https://s.test/",
      inviteCodes: ["原作者码"],
      traeLinks: ["xyz"],
      poster: "poster-doubao-laxin.jpg",
    });
    expect(out.link).toBe("https://www.aliyun.com/product/lingma");
    expect(out.inviteBase).toBeUndefined();
    expect(out.inviteCodes).toBeUndefined();
    expect(out.traeLinks).toBeUndefined();
    expect(out.poster).toBeUndefined();
  });
  it("观望条目无 link 字段也不报错", () => {
    expect(() => cleanCard({ name: "X" })).not.toThrow();
  });
  it("不修改入参", () => {
    const input = { name: "X", link: "https://a.test?userCode=1" };
    cleanCard(input);
    expect(input.link).toBe("https://a.test?userCode=1");
  });
});

describe("applySiteConfig（与镜像版语义一致）", () => {
  const cards = [
    { name: "B.AI（AI 模型聚合平台）", link: "https://b.ai/?userCode=x" },
    { name: "豆包拉新项目", link: "https://v.douyin.com/", type: "项目" },
  ];
  const donots = [{ name: "B.AI（AI 模型聚合平台）", why: "慢", link: "https://b.ai/d?invite_code=1" }];

  it("同名卡在主列表与观望名单都被覆盖", () => {
    const out = applySiteConfig(cards, donots, {
      cards: { "B.AI（AI 模型聚合平台）": { link: "https://chat.b.ai/chat" } },
    });
    expect(out.cards[0].link).toBe("https://chat.b.ai/chat");
    expect(out.donots[0].link).toBe("https://chat.b.ai/chat");
  });

  it("hide 只影响情报卡，不影响观望名单", () => {
    const out = applySiteConfig(cards, donots, { cards: { 豆包拉新项目: { hide: true } } });
    expect(out.cards.map((c) => c.name)).toEqual(["B.AI（AI 模型聚合平台）"]);
    expect(donots).toHaveLength(1);
  });

  it("配置了 link 却没配码池 → 清空码池", () => {
    const out = applySiteConfig(
      [{ name: "阶跃星辰 StepFun", link: "https://a", inviteBase: "https://b", inviteCodes: ["old"] }],
      [],
      { cards: { "阶跃星辰 StepFun": { link: "https://platform.stepfun.com/" } } }
    );
    expect(out.cards[0].inviteBase).toBeUndefined();
    expect(out.cards[0].inviteCodes).toBeUndefined();
  });

  it("未知卡片名只 warn 不抛错", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = applySiteConfig(cards, donots, { cards: { 不存在的卡: { link: "https://z" } } });
    expect(out.cards).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith("[site-config] 未找到卡片：", "不存在的卡");
    warn.mockRestore();
  });

  it("原型键不误命中", () => {
    const out = applySiteConfig(cards, donots, { cards: { constructor: { link: "https://evil" } } });
    expect(out.cards.every((c) => !/evil/.test(c.link))).toBe(true);
  });

  it("无配置时原样返回（新数组，不改入参）", () => {
    const out = applySiteConfig(cards, donots, null);
    expect(out.cards).toHaveLength(2);
    expect(out.cards).not.toBe(cards);
  });
});

describe("无协议绕过封堵（终审遗留 #10）", () => {
  it("stripPromoParams：裸域名+推广参数 → 剥参并补 https:// 归一", () => {
    expect(stripPromoParams("example.com/promo?userCode=ygtxup80&tab=1")).toBe("https://example.com/promo?tab=1");
  });
  it("stripPromoParams：裸域名无推广参数 → 原样返回（归一化零噪音纪律不变）", () => {
    expect(stripPromoParams("example.com/x")).toBe("example.com/x");
  });
  it("linkRisk：裸域名推广短链按域名命中（先于缺协议判定，理由更强）", () => {
    expect(linkRisk("s.mi.cn/NNI4kZp9")).toBe("推广短链域名 s.mi.cn");
  });
  it("linkRisk：裸域名一律判缺协议（宁可不收录也不保留跳不出去的相对链接）", () => {
    expect(linkRisk("token.taiha.cn/sign-up")).toContain("缺少协议前缀");
  });
  it("linkRisk：'#' / 空串 / 站内相对路径仍非外链，放行不变", () => {
    expect(linkRisk("#")).toBeNull();
    expect(linkRisk("")).toBeNull();
    expect(linkRisk("/docs/x")).toBeNull();
  });
});

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compiledRules } from "@/lib/rules";
import {
  brandName, cleanText, compactCardCopy, ctaHref, ctaRel, detailSlug, displayName,
  fmtMd, freeLabel, heroTitle, logoFor, OFFICIAL_LOGOS, shortText, splitNumbers, stars,
} from "@/lib/copy";
import type { TokenCard } from "@/lib/types";

const rules = compiledRules(
  JSON.parse(readFileSync(path.resolve(process.cwd(), "data/rules.json"), "utf8"))
);

describe("文案纯函数（对齐镜像行为）", () => {
  it("cleanText 把破折号统一为连字符，fmtMd 去前导零", () => {
    expect(cleanText("A — B – C")).toBe("A - B - C");
    expect(fmtMd("2026-10-05")).toBe("10/5");
  });
  it("fmtMd 对畸形/空输入原样退回，绝不产出 NaN/NaN（审查 L4）", () => {
    expect(fmtMd("—")).toBe("—");                       // latestUpdated 空集哨兵
    expect(fmtMd("")).toBe("");                           // 空串
    expect(fmtMd("2026-10")).toBe("2026-10");             // 缺日：不猜
    expect(fmtMd("长期有效")).toBe("长期有效");                 // 上游把说明文字塞进日期字段的形态
    expect(fmtMd("2026-10-07（活动截止）")).toBe("10/7");   // 实测数据里唯一的畸形值，必须仍可显示
  });
  it("shortText 超长截断并去掉结尾标点", () => {
    expect(shortText("一二三，", 2)).toBe("一二…");
    expect(shortText("短")).toBe("短");
  });
  it("displayName 命中特例并去掉中文括号", () => {
    expect(displayName({ name: "阿里云 Qoder（灵码）" } as TokenCard)).toBe("Qoder");
    expect(displayName({ name: "GLM-5.3-Flash（Ox-Alpha）" } as TokenCard)).toBe("GLM-5.3-Flash");
  });
  it("brandName 与 displayName 的差异只在厂商名", () => {
    expect(brandName({ name: "GLM-5.3-Flash（Ox-Alpha）" } as TokenCard)).toBe("智谱清言");
    expect(brandName({ name: "WorkBuddy" } as TokenCard)).toBe("WorkBuddy");
  });
  it("logoFor：特例优先 → 规则表 → 未收录品牌走中性兜底（绝不冒用他人品牌）", () => {
    expect(logoFor({ name: "WorkBuddy" } as TokenCard, rules)).toBe("assets/logos/workbuddy-official.png");
    expect(logoFor({ name: "Kilo Code" } as TokenCard, rules)).toBe("assets/logos/kilo.png");
    /* 腾讯系命中规则表仍用 tencent.png：那是合法归属，不是兜底。判据是「这张卡确实提到腾讯」 */
    expect(logoFor({ name: "腾讯云混元" } as TokenCard, rules)).toContain("tencent.png");
    /* 2026-10-16「使用官方logo」轮：这四张原先走兜底，现已各自取到官方图并钉死归属 */
    for (const [name, file] of [
      ["商汤 Token Plan（sensenova）", "sensenova.png"],
      ["BazaarLink", "bazaarlink.svg"],
      ["TeleAgent（星辰超级智能体）", "teleai.png"],
      ["字节 TRAE（AI IDE）", "trae.png"],
    ] as const) {
      expect(logoFor({ name } as TokenCard, rules)).toBe(`assets/logos/${file}`);
    }
    /* 三轮抓取仍取不到官方标的品牌继续走兜底（宁可素，不冒用） */
    for (const name of ["TArk元舟", "Loomy（科大讯飞）"]) {
      expect(logoFor({ name } as TokenCard, rules)).toBe("assets/logos/generic.svg");
    }
    expect(logoFor({ name: "xAI Grok（console.x.ai）" } as TokenCard, rules)).toBe("assets/logos/xai.ico");
    /* 牙：官方表两条 书生 系正则分属不同主体，端砚走 OpenXLab、Intern AI 走实验室 own 标 */
    expect(logoFor({ name: "书生·端砚 墨点计划（上海AI实验室）" } as TokenCard, rules)).toBe("assets/logos/openxlab.svg");
    expect(logoFor({ name: "书生 Intern AI（上海 AI 实验室）" } as TokenCard, rules)).toBe("assets/logos/internlm.png");
    /* 牙（2026-10-16 用户截图「这几个活动的图标为啥完全一样」）：旧实现还会拿 modality/effect 兜底匹配，
       于是「额度里含 GLM 模型」的聚合平台全被画成智谱标（实测 18 张，其中 10 张显示 zhipu.png）。
       卡名不含品牌词 ⇒ 必须走中性兜底，绝不因文案里的模型名冒用他人品牌。 */
    expect(logoFor({ name: "某中转站", modality: "morph-v3-large · glm-5.2" } as TokenCard, rules)).toBe("assets/logos/generic.svg");
    expect(logoFor({ name: "某聚合平台", effect: "一站式接入 GLM / 智谱 / DeepSeek" } as TokenCard, rules)).toBe("assets/logos/generic.svg");
    /* 牙：官方表正则必须锚定卡名开头。实测卡名「UOS AI（deepin）免费 DeepSeek 账号」里写着别家的模型名，
       不锚就会把 DeepSeek 标披到 deepin 卡上——正是本轮要消灭的那类错标 */
    expect(logoFor({ name: "UOS AI（deepin）免费 DeepSeek 账号" } as TokenCard, rules)).toBe("assets/logos/deepin.png");
    expect(logoFor({ name: "DeepSeek 开放平台" } as TokenCard, rules)).toBe("assets/logos/deepseek.svg");
  });
  it("OFFICIAL_LOGOS 指向的文件必须真在 public/assets/logos 里（断图＝线上破图）", () => {
    const dir = path.resolve(process.cwd(), "public/assets/logos");
    const onDisk = new Set(readdirSync(dir));
    for (const [re, file] of OFFICIAL_LOGOS) {
      expect(onDisk.has(file), `${re.source} → ${file} 不存在`).toBe(true);
    }
    /* 同一张图不许同时挂两个不同 slug（复制粘贴出错的品牌表最容易犯这条） */
    const byContent = new Map<string, string>();
    for (const [, file] of OFFICIAL_LOGOS) {
      const sum = createHash("sha256").update(readFileSync(path.join(dir, file))).digest("hex");
      const first = byContent.get(sum);
      if (first && first !== file) throw new Error(`${file} 与 ${first} 字节相同，归属可疑`);
      byContent.set(sum, file);
    }
  });
  it("freeLabel：limited > 长期 > 默认", () => {
    expect(freeLabel({ limited: "2026-09-30" } as TokenCard)).toBe("限时 9/30");
    expect(freeLabel({ quota: "长期免费开放" } as TokenCard)).toBe("长期免费");
    expect(freeLabel({ quota: "注册送额度" } as TokenCard)).toBe("免费额度");
  });
  it("heroTitle 返回分段（lead + hl），供 JSX 高亮渲染", () => {
    /* 镜像把高亮写成 innerHTML；本站改为返回分段，组件用 <Highlight> 渲染，故断言对象而非字符串 */
    expect(heroTitle({ name: "WorkBuddy" } as TokenCard, 0)).toEqual({ lead: "更强的 AI 工作空间，", hl: "从免费开始" });
    expect(heroTitle({ name: "阿里云 Qoder（灵码）" } as TokenCard, 1)).toEqual({ lead: "为真实开发而生的 ", hl: "AI 编程伙伴" });
    expect(heroTitle({ name: "X" } as TokenCard, 0)).toEqual({ lead: "高价值额度，", hl: "先领先用" });
    expect(heroTitle({ name: "X" } as TokenCard, 1)).toEqual({ lead: "可靠模型，", hl: "免费开用" });
  });
  it("compactCardCopy：命中规则用规则文案，否则用首段模型名", () => {
    expect(compactCardCopy({ name: "WorkBuddy", modality: "a" } as TokenCard, rules)).toEqual({
      models: "HY3 / HY4 / DeepSeek-V4.1",
      summary: "新用户可领多模型免费额度，开箱即用。",
    });
    const miss = compactCardCopy({ name: "无名平台", modality: "GLM-5.3 · DeepSeek V4" } as TokenCard, rules);
    expect(miss.models).toBe("GLM-5.3");
    expect(miss.summary).toBe("注册可用免费额度，适合日常体验与开发。");
  });
  it("detailSlug：命中规则否则 FNV 哈希，同名稳定", () => {
    expect(detailSlug("WorkBuddy", rules)).toBe("workbuddy");
    expect(detailSlug("阿里云 Qoder（灵码）", rules)).toBe("qoder");
    const hash = detailSlug("没配规则的平台", rules);
    expect(hash).toMatch(/^item-[a-z0-9]+$/);
    expect(detailSlug("没配规则的平台", rules)).toBe(hash);
  });
  it("ctaHref/ctaRel：外链带 sponsored 标记，清洗后的官方链不带", () => {
    expect(ctaHref({ link: "https://a.test" } as TokenCard)).toBe("https://a.test");
    expect(ctaRel({ link: "https://a.test" } as TokenCard)).toBe("noopener noreferrer");
    expect(ctaRel({ link: "https://work-fission.x/1" } as TokenCard)).toContain("sponsored");
  });
  it("stars 五颗、splitNumbers 把「数字+单位」整段切出（供荧光笔渲染）", () => {
    expect(stars(4)).toBe("★★★★☆");
    /* 与镜像 app.js:579 相比只有两处有意归一化：① 删冗余 \s*token 分支（/i 下已被 Tokens? 覆盖，无行为差异）；② 元/积分/RPM/TPM 前补 \s*，仅影响「量词+空格+单位」形态（如 "2万 元"：镜像只高亮 "2万"，本站整段 "2万 元"）；普通「数字 空格 单位」（如 "5 元"、"100 RPM"）两版都整段高亮，因数字后的 \s* 已吸收空格。其余逐字符一致：单位（积分/次/Tokens…）随数字一起高亮 */
    expect(splitNumbers("送 2000 积分")).toEqual([
      { text: "送 ", num: false },
      { text: "2000 积分", num: true },
    ]);
    expect(splitNumbers("10 亿 Token + 10 万张生图")).toEqual([
      { text: "10 亿 Token", num: true },
      { text: " + ", num: false },
      { text: "10 万", num: true },
      { text: "张生图", num: false },
    ]);
  });
  it("splitNumbers：普通「数字 元」整段高亮（与镜像一致，钉住行为）", () => {
    expect(splitNumbers("送 5 元")).toEqual([
      { text: "送 ", num: false },
      { text: "5 元", num: true },
    ]);
  });
  it("splitNumbers：「量词+空格+元」整段高亮（与镜像行为差异的区分用例，镜像只切出「2万」）", () => {
    expect(splitNumbers("领 2万 元")).toEqual([
      { text: "领 ", num: false },
      { text: "2万 元", num: true },
    ]);
  });
});

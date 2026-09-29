import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCards, validateRulesJson } from "../crawler/validate.mjs";

const realCards = JSON.parse(readFileSync("data/tokens.json", "utf8"));
const realRules = JSON.parse(readFileSync("data/rules.json", "utf8"));

describe("写入侧校验（终审遗留 #4 爬虫侧）", () => {
  it("真实种子数据全量通过（校验=同一条 linkRisk 红线，非另立标准）", () => {
    expect(validateCards(realCards)).toBe(realCards);
    expect(validateRulesJson(realRules)).toBe(realRules);
  });
  it("裸域名卡链接被拒（无协议绕过封堵落到管线入口）", () => {
    expect(() => validateCards([{ name: "坏卡", link: "token.taiha.cn/sign-up" }])).toThrowError(
      /坏卡·link：缺少协议前缀/
    );
  });
  it("extraAction.link 同样受审", () => {
    expect(() =>
      validateCards([{ name: "带副动作", link: "https://ok.example/", extraAction: { text: "领", link: "s.qiniu.com/VV7Zfa" } }])
    ).toThrowError(/副动作|extraAction/);
  });
  it("规则表含非法正则：错误含 rules.logo#0 定位", () => {
    expect(() => validateRulesJson({ ...realRules, logo: [{ source: "(", flags: "i", slug: "x.png" }] })).toThrowError(
      /rules\.logo#0/
    );
  });
});

import { describe, expect, it } from "vitest";
import { allowlistCheck, denyNote, parseLogins } from "../crawler/allowlist.mjs";

describe("adminLogins 比对（前端白名单与 review job 同一把锁）", () => {
  it("命中：大小写与首尾空白不敏感；名单文本切分只有一种口径", () => {
    expect(allowlistCheck({ login: "  Hope0719 ", logins: ["hope0719"] })).toEqual({
      ok: true,
      reason: "ok",
      login: "Hope0719",
    });
    expect(allowlistCheck({ login: "octocat", logins: ["OctoCat"] }).ok).toBe(true);
    // 半角/全角逗号与空白都当分隔符（配置页的一行输入与 Issue 评论共用）
    expect(parseLogins("hope0719, bot-user，someone  else")).toEqual(["hope0719", "bot-user", "someone", "else"]);
    expect(parseLogins("")).toEqual([]);
  });

  it("空名单 fail-closed：没填＝谁都不进（当前仓库态就是 []）", () => {
    for (const logins of [[], undefined, null, "hope0719"]) {
      expect(allowlistCheck({ login: "hope0719", logins: logins as never }).reason).toBe("empty_allowlist");
    }
    expect(allowlistCheck({ login: "hope0719", logins: [] }).ok).toBe(false);
  });

  it("未登录：空串/纯空白/非字符串一律 no_login，不与「名单为空」混因", () => {
    for (const login of ["", "   ", undefined, null, 42]) {
      expect(allowlistCheck({ login: login as never, logins: ["hope0719"] }).reason).toBe("no_login");
    }
  });

  it("未命中：not_allowed；denyNote 三种原因各一句且措辞带配置路径", () => {
    const v = allowlistCheck({ login: "stranger", logins: ["hope0719"] });
    expect(v).toEqual({ ok: false, reason: "not_allowed", login: "stranger" });
    expect(denyNote(v)).toBe("`stranger` 不在 config/site-config.json 的 adminLogins 名单里：确认权限请由名单内账号提交该 login 后重试。");
    expect(denyNote(allowlistCheck({ login: "", logins: ["a"] }))).toContain("Device Flow");
    expect(denyNote(allowlistCheck({ login: "a", logins: [] }))).toContain("config/site-config.json");
    expect(denyNote({} as never)).toBe("");
  });
});

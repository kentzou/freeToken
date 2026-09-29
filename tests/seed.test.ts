import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { linkRisk } from "../crawler/clean.mjs";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const tokens = JSON.parse(read("data/tokens.json"));
const donots = JSON.parse(read("data/donots.json"));
const rules = JSON.parse(read("data/rules.json"));
const meta = JSON.parse(read("data/meta.json"));

describe("种子数据（由脚本从真实镜像生成）", () => {
  it("条数与上游一致", () => {
    expect(tokens).toHaveLength(41 - 2); // 隐藏「豆包拉新项目」推广卡 + 「小米 MiMo」邀请短链
    expect(donots).toHaveLength(22);
    expect(meta.counts).toEqual({ tokens: 39, donots: 22 });
  });

  it("全量链接过 linkRisk（与 seed 脚本同一份判定，含 hash 参数与推广短链域）", () => {
    const bad = [...tokens, ...donots].flatMap((x) =>
      [x.link, x.extraAction && x.extraAction.link]
        .map((u) => [x.name, u, linkRisk(u)])
        .filter((r) => r[2])
    );
    expect(bad.map((b) => `${b[0]} ${b[1]} → ${b[2]}`)).toEqual([]);
  });

  it("不含原作者邀请码池与微信号", () => {
    const raw = read("data/tokens.json") + read("data/donots.json");
    expect(raw).not.toContain("lmfh2022");
    expect(raw).not.toContain("AATGOEHF");
    expect(raw).not.toContain("ygtxup80");
    expect(raw).not.toContain("CQLBPC");
    expect(tokens.every((t: any) => t.inviteCodes === undefined)).toBe(true);
  });

  it("不含原作者海报物料", () => {
    expect(tokens.every((t: any) => t.poster === undefined)).toBe(true);
  });

  it("规则表可还原为 RegExp 且门槛标签齐全", () => {
    expect(rules.featured.map((r: any) => r.label)).toEqual([
      "DeepSeek V4", "GLM 5.2", "Kimi K3", "千问 3.8 Max", "Hy3", "LongCat 2.0",
    ]);
    rules.featured.forEach((r: any) => expect(() => new RegExp(r.source, r.flags)).not.toThrow());
    expect(rules.logo.length).toBe(32);
    expect(rules.cardCopy.length).toBe(19);
    expect(rules.detailSlug.length).toBe(21);
    /* flags 必须一路带到 rules.json：丢了 /i，`detailSlug("WorkBuddy")` 会回落 item-xxxxxx */
    const pair = [...rules.logo, ...rules.cardCopy, ...rules.detailSlug];
    expect(pair.every((r: any) => r.flags === "i")).toBe(true);
    expect(pair.every((r: any) => new RegExp(r.source, r.flags) instanceof RegExp)).toBe(true);
  });

  it("每条卡都有 name/type/updated，日期格式为 ISO", () => {
    tokens.forEach((t: any) => {
      expect(typeof t.name).toBe("string");
      expect(["大模型", "工具", "项目"]).toContain(t.type);
      expect(t.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("meta 含条数，lastSyncedSha 为 null 表示本地种子", () => {
    expect(meta.counts).toEqual({ tokens: tokens.length, donots: donots.length });
    expect(meta.lastSyncedSha).toBeNull();
    expect(meta.lastSyncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta.issueNo).toBeUndefined();
  });

  it("可复现：同输入两次导出得到同一 SHA256", () => {
    const sha = (o: unknown) =>
      createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 12);
    expect(sha(tokens)).toBe(sha(JSON.parse(read("data/tokens.json"))));
  });
});

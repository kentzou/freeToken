import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const crawl = load(readFileSync(".github/workflows/crawl.yml", "utf8")) as Record<string, any>;
const deploy = load(readFileSync(".github/workflows/deploy.yml", "utf8")) as Record<string, any>;
const lhrc = JSON.parse(readFileSync(".lighthouserc.json", "utf8"));

describe("workflow 结构红线（真实执行列入线上步骤，这里锁死形态）", () => {
  it("crawl.yml：6 小时 cron + dispatch + issue_comment 三入口；数据 commit 只在真变更时发生", () => {
    expect(crawl.on.schedule).toEqual([{ cron: "0 */6 * * *" }]);
    expect(Object.keys(crawl.on)).toEqual(["schedule", "workflow_dispatch", "issue_comment"]);
    expect(crawl.jobs.crawl.if).toContain("issue_comment");
    const crawlSteps = crawl.jobs.crawl.steps.map((s: { run?: string }) => s.run || "").join("\n");
    expect(crawlSteps).toContain("npm run crawl");
    expect(crawlSteps).toContain("git diff --cached --quiet"); // 无实质变更不产生空提交
    /* 终审遗留 (C)：命令前缀判定权归 parseCommands（/i + 容忍前导空白 + 逐行解析）。
       workflow 里再写 startsWith('/approve') 就成了「门比锁严」：/APPROVE、" /approve"、
       「说明文字 + 换行 + 指令」全部不会被触发。触发面只按 label，命令面只按解析器。 */
    expect(crawl.jobs.review.if).toContain("issue_comment");
    expect(crawl.jobs.review.if).toContain("contains(github.event.issue.labels.*.name, 'review')");
    expect(crawl.jobs.review.if).not.toContain("startsWith");
    expect(crawl.jobs.review.if).not.toContain("/approve");
    expect(crawl.permissions).toMatchObject({ "contents": "write", "issues": "write" });
  });

  it("deploy.yml：quality → lighthouse → deploy 三级链；红线测试与 Lighthouse 门禁都在部署前", () => {
    expect(deploy.jobs.lighthouse.needs).toBe("quality");
    expect(deploy.jobs.deploy.needs).toBe("lighthouse");
    const q = deploy.jobs.quality.steps.map((s: { run?: string }) => s.run || "").join("\n");
    expect(q).toContain("npm run test\n");
    expect(q).toContain("npm run seed:repro");
    expect(q).toContain("npm run test:out"); // 终审 #6：产物红线接 CI
    const names = deploy.jobs.lighthouse.steps.map((s: { name?: string; uses?: string }) => s.name || s.uses || "");
    expect(names.join("\n")).toContain("Lighthouse 门禁");
    expect(deploy.jobs.lighthouse.steps.some((s: { uses?: string }) => (s.uses || "").startsWith("treosh/lighthouse-ci-action@"))).toBe(true);
    expect(deploy.jobs.deploy.steps.some((s: { uses?: string }) => (s.uses || "").startsWith("actions/deploy-pages@"))).toBe(true);
  });

  it(".lighthouserc.json：三项门槛值 = spec §9 承诺值（LCP 2500ms / CLS 0.1 / A11y 0.95），URL 打本地根路径", () => {
    expect(lhrc.ci.assert.assertions["largest-contentful-paint"]).toEqual(["error", { median: 2500 }]);
    expect(lhrc.ci.assert.assertions["cumulative-layout-shift"]).toEqual(["error", { median: 0.1 }]);
    expect(lhrc.ci.assert.assertions["categories:accessibility"]).toEqual(["error", { minScore: 0.95 }]);
    expect(lhrc.ci.collect.url).toEqual(["http://127.0.0.1:3000/", "http://127.0.0.1:3000/intel/workbuddy/"]);
  });
});

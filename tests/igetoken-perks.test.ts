import { existsSync, readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { IGETOKEN_PERKS_URL, crawlIgetokenPerks, parsePerks } from "../crawler/igetoken-perks.mjs";

const NOW = "2026-10-15T23:30:00.000Z";

/** 一张卡的字段切分（与 2026-10-15 实测的 /perks/ 卡片 DOM 逐字对齐）：
 *  名字档 / 类别档两个 span、h3 标题、emerald-700 段落是额度原句、slate-500 是领取步骤、
 *  无类名裸 span 是条件明细、border-t slate-400 是「不可导出为 API Key」免责、尾档是核实日。 */
const card = (name: string, category: string, href: string, quota: string) => `<div data-category="${category}" class="mb-4 w-full break-inside-avoid">
  <a href="${href}" target="_blank" rel="noopener noreferrer" class="group flex flex-col rounded-xl">
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">${name}</span>
      <span class="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">每日签到</span>
    </div>
    <h3 class="mt-3 font-semibold">${name} 的标题</h3>
    <p class="mt-1.5 text-sm font-medium text-emerald-700">${quota}</p>
    <p class="mt-2 text-sm text-slate-500">打开官网 → 登录 → 签到</p>
    <div class="mt-3 flex flex-wrap gap-x-2 text-xs"><span>每日</span> <span>·</span> <span>长期可领</span></div>
    <p class="mt-3 border-t pt-3 text-xs text-slate-400">🔴 产品内积分，不可导出为 API&nbsp;Key</p>
    <div class="mt-3 flex items-center justify-between"><span class="text-xs text-slate-400">09/11 已核实</span><span class="text-amber-700">官方领取 →</span></div>
  </a>
</div>`;

/** 自造小 fixture（不抄真实上游全文）：含三处真实形态的坑——href 里「A 与 B」两条链接、
 *  额度原句里嵌 <strong>、免责里带 &#160; 实体。 */
const FIXTURE = `<h1 class="text-3xl font-black">Agent 福利社</h1>
<p class="mt-2 text-slate-500">共 <strong>2</strong> 个产品的积分 / 福利。这是产品内积分，与本站「免费 API Token」是两类东西——积分<strong>不能导出为 API Key</strong>。</p>
<div class="filter-tabs"><button data-filter="all">全部</button><button data-filter="signin">每日签到</button><button data-filter="invite">邀请有礼</button></div>
<div id="perks-grid" class="mt-6">${card("B 家", "signin", "https://b.example.com/", "每日 100 <strong>积分</strong>（当日有效）")}${card("A 家", "invite", "https://a.example.com/x 与 https://login.a.example.com/y", "邀请人 +100 &amp; 被邀请人 +350")}</div>`;

const fakeGrab = (out: Record<string, unknown>) => async () => out as never;

describe("iGetoken 积分福利台账（线索文件，出处页自述不可导出为 API Key）", () => {
  it("字段切分、裸标签剥离、实体解码、按 id 定序、页面自述条数入账", () => {
    const doc = parsePerks(FIXTURE, { now: NOW });
    expect([doc.declaredCount, doc.itemCount, doc.source]).toEqual([2, 2, IGETOKEN_PERKS_URL]);
    // 定序认 id（UTF-16 码序），页面序「B 家在前」被改成「A 家在前」
    expect(doc.items.map((i: any) => i.id)).toEqual(["A 家|invite", "B 家|signin"]);
    const a = doc.items[0];
    expect(a).toMatchObject({ name: "A 家", categoryLabel: "每日签到", checkedAt: "09/11 已核实" });
    expect(a.quota).toBe("邀请人 +100 & 被邀请人 +350");
    // 上游把两条链接写在同一个 href 里：全收、不做取舍、不静默丢第二条
    expect(a.links).toEqual(["https://a.example.com/x", "https://login.a.example.com/y"]);
    // &#160; 解出来是 U+00A0，被空白归一并掉（留进 JSON 会变成 diff 里的隐形改动）
    expect(doc.items[1].disclaimer).toBe("🔴 产品内积分，不可导出为 API Key");
    expect(doc.items[1].terms).toBe("每日 · 长期可领");
    // 定位声明原句入库：它变了收录口径就得重议，不是我们贴的标签
    expect(doc.scopeNote).toContain("不能导出为 API");
    expect(JSON.stringify(doc)).not.toMatch(/<strong>/);
  });

  it("fail-stop 六形态全抛：缺网格 / 缺定位声明 / 读不到条数 / 档位外类别 / 缺额度原句 / 静默丢条目", () => {
    expect(() => parsePerks("<div id=\"other-grid\"></div>", { now: NOW })).toThrow(/perks-grid/);
    expect(() => parsePerks(FIXTURE.replace(/<h1[\s\S]*?<\/p>/, ""), { now: NOW })).toThrow(/定位声明/);
    expect(() => parsePerks(FIXTURE.replace("共 <strong>2</strong> 个产品", "若干产品"), { now: NOW })).toThrow(/共 N 个产品/);
    expect(() => parsePerks(FIXTURE.replace('data-category="invite"', 'data-category="bonus"'), { now: NOW })).toThrow(/不在页面档位/);
    expect(() => parsePerks(FIXTURE.replace(/<p class="mt-1\.5[^]*?<\/p>/, ""), { now: NOW })).toThrow(/缺 quota/);
    // 解析少一张而对方自述没改＝改版静默丢条目，必须响亮拒绝而不是写一份少一条的账
    expect(() => parsePerks(FIXTURE.replace(card("B 家", "signin", "https://b.example.com/", "每日 100 <strong>积分</strong>（当日有效）"), ""), { now: NOW })).toThrow(/页面自述 2 个产品/);
  });

  it("同名同档两张＝身份键失效，拒绝产一份会撒谎的台账", () => {
    const dup = FIXTURE.replace("共 <strong>2</strong> 个产品", "共 <strong>3</strong> 个产品");
    const third = card("B 家", "signin", "https://b.example.com/", "每日 100 积分");
    expect(() => parsePerks(`${dup}${third}`, { now: NOW })).toThrow(/重复出现/);
  });

  it("编排产出 data/igetoken-perks.json 一份；HTTP 失败 fail-stop", async () => {
    const { doc, files } = await crawlIgetokenPerks({ grab: fakeGrab({ ok: true, status: 200, text: FIXTURE, error: "" }), now: NOW });
    expect(Object.keys(files)).toEqual(["data/igetoken-perks.json"]);
    expect(doc.itemCount).toBe(2);
    expect(doc.sourceFingerprint).toMatch(/^[0-9a-f]{16}$/);
    await expect(crawlIgetokenPerks({ grab: fakeGrab({ ok: false, status: 403, text: "", error: "HTTP 403" }), now: NOW })).rejects.toThrow(/HTTP 403/);
  });

  it("真实台账（本机 2026-10-15 首跑产物）只钉结构不变量，不钉快照值", () => {
    const p = "data/igetoken-perks.json";
    if (!existsSync(p)) return; // 未落盘时不染红（workflow 首跑会产）
    const ledger = JSON.parse(readFileSync(p, "utf8"));
    expect(ledger.itemCount).toBe(ledger.items.length);
    expect(ledger.declaredCount).toBe(ledger.items.length);
    expect(new Set(ledger.items.map((i: any) => i.id)).size).toBe(ledger.items.length);
    expect(ledger.items.every((i: any) => i.name && i.quota && i.checkedAt && i.disclaimer)).toBe(true);
    expect(ledger.items.every((i: any) => i.links.length && i.links.every((u: string) => /^https:\/\//.test(u)))).toBe(true);
    const ids = ledger.items.map((i: any) => i.id);
    expect([...ids].sort()).toEqual(ids);
  });
});

/* workflow 形态断言按 house 口径本应写进 tests/workflows.test.ts，此处刻意落在本文件：
   并发会话正在改那份（crawl-igetoken.yml 的断言尚未补进去），同区双写会撞车。
   它收口后可以把本段并过去，别长期留成第二份。 */
describe("crawl-igetoken-perks.yml 形态", () => {
  const wf = load(readFileSync(".github/workflows/crawl-igetoken-perks.yml", "utf8")) as Record<string, any>;
  const runs = wf.jobs.crawl.steps.map((s: { run?: string }) => s.run || "").join("\n");
  const cmds = runs.split("\n").filter((l: string) => !l.trim().startsWith("#")).join("\n");

  it("每日 07:30 CST 换算成 UTC cron、分钟位避开整点与相邻四条档位；零依赖；只提交一份台账", () => {
    expect(wf.on.schedule).toEqual([{ cron: "30 23 * * *" }]);
    expect(Object.keys(wf.on)).toEqual(["schedule", "workflow_dispatch"]);
    expect(wf.permissions).toEqual({ "contents": "write" }); // 无 actions: write ⇒ 没有能推上线的通道
    const fields = String(wf.on.schedule[0].cron).trim().split(/\s+/);
    expect(fields).toHaveLength(5);
    expect(fields[0]).not.toBe("0");
    expect(cmds).toContain("npm run crawl:perks");
    expect(cmds).not.toMatch(/npm (ci|install)\b/);
    expect(cmds).toContain("git add data/igetoken-perks.json");
    // 具名 pathspec：裸 `git add data` 会把别人的在途产物一起带走（负向断言要放过自己那一份）
    expect(cmds).not.toMatch(/git add data(?!\/igetoken-perks\.json)/);
    expect(cmds).toContain("if [ ! -f data/igetoken-perks.json ]");
    expect(cmds).toContain("git pull --rebase origin main");
  });

  it("不 dispatch deploy、不碰 pending：线索文件绝不能因一次自动抓取变成线上内容", () => {
    expect(cmds).not.toContain("dispatches");
    expect(cmds).not.toMatch(/git add (pending|data\/tokens)/);
  });
});

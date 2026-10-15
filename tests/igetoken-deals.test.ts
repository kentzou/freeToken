import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IGETOKEN_FLASH_LINK,
  IGETOKEN_RSS_URL,
  IGETOKEN_SECTIONS,
  crawlIgetokenDeals,
  parseDeals,
} from "../crawler/igetoken-deals.mjs";
import { EMPTY_IGETOKEN_LEDGER, readIgetokenLedger } from "../src/lib/data.server";

const NOW = "2026-10-15T06:30:00.000Z";

/** 自造小 fixture（不抄真实上游全文）：字段形态逐字对齐 2026-10-15 实测的 /rss.xml——
 *  RFC 1123 pubDate 全 GMT、三栏目混排、标题带 &amp; 与 &#x27; 实体，
 *  并且 perks 两条**共用同一条 link**（真实上游 `/perks/` 就是只有列表页、没有详情页）。 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>t</title>
  <item>
    <title>A &amp; B 限免 &#x27;5 天&#x27;</title>
    <link>https://igetoken.com/deals/2026-10-a-b-free/</link>
    <pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate>
    <description>这段正文按红线必须被丢弃，绝不落盘</description>
  </item>
  <item>
    <title>更晚的一条</title>
    <link>https://igetoken.com/deals/2026-10-later/</link>
    <pubDate>Fri, 09 Oct 2026 00:00:00 GMT</pubDate>
    <description>丢弃</description>
  </item>
  <item>
    <title>新平台上线：某模型平台</title>
    <link>https://igetoken.com/models/some-model/</link>
    <pubDate>Fri, 09 Oct 2026 00:00:00 GMT</pubDate>
    <description>丢弃</description>
  </item>
  <item>
    <title>积分福利：甲 · 注册送 1000 积分</title>
    <link>https://igetoken.com/perks/</link>
    <pubDate>Wed, 10 Sep 2026 00:00:00 GMT</pubDate>
    <description>丢弃</description>
  </item>
  <item>
    <title>积分福利：乙 · 每日签到领 400 积分</title>
    <link>https://igetoken.com/perks/</link>
    <pubDate>Wed, 10 Sep 2026 00:00:00 GMT</pubDate>
    <description>丢弃</description>
  </item>
  <item>
    <title>四栏目之外的条目不收录</title>
    <link>https://igetoken.com/blog/somewhere/</link>
    <pubDate>Fri, 09 Oct 2026 00:00:00 GMT</pubDate>
    <description>丢弃</description>
  </item>
</channel></rss>`;

const fakeGrab = (out: Record<string, unknown>) => async () => out as never;
const sections = (doc: any) => doc.items.map((i: any) => i.section);

describe("iGetoken 快讯台账（三栏目跳转索引，只登记标题+链接+日期，正文不落盘）", () => {
  it("deals/models/perks 三栏目全收，实体解码、日期归一、date 降序", () => {
    const doc = parseDeals(FIXTURE, { now: NOW });
    expect(doc.itemCount).toBe(5);
    expect(doc.sections).toEqual({ deals: 2, models: 1, perks: 2 });
    // 同日按 link 升序：models/some-model < perks（同日 10-09 与 09-10 分属两组，组内看 link）
    expect(doc.items.map((i: any) => i.id)).toEqual([
      "2026-10-later",
      "some-model",
      "2026-10-a-b-free",
      expect.stringMatching(/^perks-[0-9a-f]{10}$/),
      expect.stringMatching(/^perks-[0-9a-f]{10}$/),
    ]);
    const older = doc.items.find((i: any) => i.id === "2026-10-a-b-free")!; // ! 只在类型层，未命中会抛 TypeError 让本例照样红
    expect(older.title).toBe("A & B 限免 '5 天'");
    expect(older.date).toBe("2026-10-01");
    expect(sections(doc).filter((s: string) => s === "blog")).toHaveLength(0);
    // 版权红线的形态证据：产物任何字段都不含 description 文本
    expect(JSON.stringify(doc)).not.toContain("正文按红线");
  });

  it("perks 条目共用一条 link，id 仍逐条唯一（否则 React key 与每日 diff 都会串）", () => {
    const doc = parseDeals(FIXTURE, { now: NOW });
    const perks = doc.items.filter((i: any) => i.section === "perks");
    expect(perks).toHaveLength(2);
    expect(perks[0].link).toBe(perks[1].link);
    expect(perks[0].id).not.toBe(perks[1].id);
    expect(new Set(doc.items.map((i: any) => i.id)).size).toBe(doc.itemCount);
    // 同一标题恒得同一 id：跨天抓取不会把一条福利刷成两条
    expect(parseDeals(FIXTURE, { now: NOW }).items.filter((i: any) => i.section === "perks").map((i: any) => i.id)).toEqual(
      perks.map((i: any) => i.id)
    );
  });

  it("fail-stop 形态全抛：非 RSS 页 / 无 item / 缺 title / pubDate 不可解析", () => {
    expect(() => parseDeals("<html><body>Just a page</body></html>", { now: NOW })).toThrow(/缺 <rss>/);
    expect(() => parseDeals("<rss><channel></channel></rss>", { now: NOW })).toThrow(/缺 <rss>/);
    expect(() => parseDeals(FIXTURE.replace("<title>A &amp; B 限免 &#x27;5 天&#x27;</title>", ""), { now: NOW })).toThrow(/缺 title/);
    expect(() => parseDeals(FIXTURE.replace("Thu, 01 Oct 2026 00:00:00 GMT", "不是日期"), { now: NOW })).toThrow(/pubDate/);
  });

  it("三栏目合计 0 条拒绝写盘（对方改栏目路径时要响亮不要静默）", () => {
    // 牙（2026-10-15 实测漏收录事故）：链接判据若写成「栏目名后再要一段＋尾斜杠」，
    // `/perks/`（末段即栏目名）会被整档静默跳过 ⇒ 这条把三栏目一起换成别的前缀，必须抛。
    let xml = FIXTURE;
    for (const s of IGETOKEN_SECTIONS) xml = xml.replaceAll(`/${s}/`, "/other/");
    expect(() => parseDeals(xml, { now: NOW })).toThrow(/合计 0 条/);
  });

  it("编排经 grabText 形状读 RSS，产出 data/igetoken-deals.json 一份；HTTP 失败 fail-stop", async () => {
    const { doc, files } = await crawlIgetokenDeals({ grab: fakeGrab({ ok: true, status: 200, text: FIXTURE, error: "" }), now: NOW });
    expect(doc.itemCount).toBe(5);
    expect(doc.source).toBe(IGETOKEN_RSS_URL);
    expect(Object.keys(files)).toEqual(["data/igetoken-deals.json"]);
    await expect(crawlIgetokenDeals({ grab: fakeGrab({ ok: false, status: 403, text: "", error: "HTTP 403" }), now: NOW })).rejects.toThrow(/HTTP 403/);
  });
});

describe("data/igetoken-deals.json 缺席不得染红构建（与 openrouter 同宽容语义）", () => {
  it("目录里没有该文件 / JSON 损坏 → 空台账，不 throw", () => {
    const dir = path.join(os.tmpdir(), `deals-absent-${process.pid}`);
    mkdirSync(path.join(dir, "data"), { recursive: true });
    try {
      expect(readIgetokenLedger(dir)).toEqual(EMPTY_IGETOKEN_LEDGER);
      writeFileSync(path.join(dir, "data", "igetoken-deals.json"), "{不是 json");
      expect(readIgetokenLedger(dir)).toEqual(EMPTY_IGETOKEN_LEDGER);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("真实台账（crawl-igetoken-deals 每日覆盖）只钉结构不变量，不钉快照值", () => {
    const ledger = readIgetokenLedger();
    if (!ledger.items.length) return; // 首份台账入库前允许空（缺席分支已由上一条覆盖）
    expect(ledger.itemCount).toBe(ledger.items.length);
    expect(ledger.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(ledger.items.every((i) => IGETOKEN_FLASH_LINK.test(i.link))).toBe(true);
    // 栏目集合封闭：出现第四个栏目＝对方改版，判据要跟着改，不能默默收进来
    expect([...new Set(ledger.items.map((i) => i.section))].every((s) => IGETOKEN_SECTIONS.includes(s))).toBe(true);
    expect(new Set(ledger.items.map((i) => i.id)).size).toBe(ledger.itemCount);
    expect(ledger.items.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date))).toBe(true);
    // 与抓取侧同一条定序律：date 降序
    const dates = ledger.items.map((i) => i.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    // 版权红线在数据文件里的落点：没有 description 字段
    expect(readFileSync("data/igetoken-deals.json", "utf8")).not.toMatch(/"description"/);
  });
});

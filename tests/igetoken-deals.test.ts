import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IGETOKEN_RSS_URL, crawlIgetokenDeals, parseDeals } from "../crawler/igetoken-deals.mjs";
import { EMPTY_IGETOKEN_LEDGER, readIgetokenLedger } from "../src/lib/data.server";

const NOW = "2026-10-15T06:30:00.000Z";

/** 自造小 fixture（不抄真实上游全文）：字段形态逐字对齐 2026-10-15 实测的 /rss.xml——
 *  RFC 1123 pubDate 全 GMT、link 尾斜杠、混排 deals/models/perks 三栏目、标题带 &amp; 与 &#x27; 实体。 */
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
    <title>模型栏目不收录</title>
    <link>https://igetoken.com/models/some-model/</link>
    <pubDate>Fri, 09 Oct 2026 00:00:00 GMT</pubDate>
    <description>丢弃</description>
  </item>
</channel></rss>`;

const fakeGrab = (out: Record<string, unknown>) => async () => out as never;

describe("iGetoken 活动快讯台账（只登记标题+链接+日期，正文不落盘）", () => {
  it("混排三栏目只收 deals，实体解码、日期归一、date 降序", () => {
    const doc = parseDeals(FIXTURE, { now: NOW });
    expect(doc.itemCount).toBe(2);
    expect(doc.items.map((i: any) => i.id)).toEqual(["2026-10-later", "2026-10-a-b-free"]);
    const older = doc.items[1];
    expect(older.title).toBe("A & B 限免 '5 天'");
    expect(older.date).toBe("2026-10-01");
    // 版权红线的形态证据：产物任何字段都不含 description 文本
    expect(JSON.stringify(doc)).not.toContain("正文按红线");
  });

  it("fail-stop 四形态全抛：非 RSS 页 / 无 item / 缺 title / pubDate 不可解析", () => {
    expect(() => parseDeals("<html><body>Just a page</body></html>", { now: NOW })).toThrow(/缺 <rss>/);
    expect(() => parseDeals("<rss><channel></channel></rss>", { now: NOW })).toThrow(/缺 <rss>/);
    expect(() => parseDeals(FIXTURE.replace("<title>A &amp; B 限免 &#x27;5 天&#x27;</title>", ""), { now: NOW })).toThrow(/缺 title/);
    expect(() => parseDeals(FIXTURE.replace("Thu, 01 Oct 2026 00:00:00 GMT", "不是日期"), { now: NOW })).toThrow(/pubDate/);
  });

  it("deals 条目为 0 拒绝写盘（上游改栏目路径时要响亮不要静默）", () => {
    const noDeals = FIXTURE.replaceAll("/deals/", "/other/");
    expect(() => parseDeals(noDeals, { now: NOW })).toThrow(/deals 条目为 0/);
  });

  it("编排经 grabText 形状读 RSS，产出 data/igetoken-deals.json 一份；HTTP 失败 fail-stop", async () => {
    const { doc, files } = await crawlIgetokenDeals({ grab: fakeGrab({ ok: true, status: 200, text: FIXTURE, error: "" }), now: NOW });
    expect(doc.itemCount).toBe(2);
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
    expect(ledger.items.every((i) => IGETOKEN_RSS_OK(i.link))).toBe(true);
    expect(ledger.items.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date))).toBe(true);
    // 与抓取侧同一条定序律：date 降序
    const dates = ledger.items.map((i) => i.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    // 版权红线在数据文件里的落点：没有 description 字段
    expect(readFileSync("data/igetoken-deals.json", "utf8")).not.toMatch(/"description"/);
  });
});

const IGETOKEN_RSS_OK = (u: string) => /^https:\/\/igetoken\.com\/deals\//.test(u);

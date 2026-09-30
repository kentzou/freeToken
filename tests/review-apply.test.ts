import { describe, expect, it } from "vitest";
import { allowlistCheck, denyNote } from "../crawler/allowlist.mjs";
import { commandText, noChangeNote, parseCommands, reviewGate, runReview } from "../crawler/review.mjs";
import { keyOf } from "../crawler/diff.mjs";
import { realData } from "./helpers/pending";

function res(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function mkFetch(...responses: unknown[]) {
  const calls: { url: string; init: Record<string, unknown> }[] = [];
  let i = 0;
  const fn = async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as Record<string, unknown> });
    return responses[Math.min(i++, responses.length - 1)];
  };
  return { fn, calls };
}

const pending = {
  version: 1, upstreamSha: "s", detectedAt: "t",
  changes: [
    { kind: "card", name: "甲", before: { name: "甲", link: "https://a1/" }, after: { name: "甲", link: "https://a2/" }, fields: [] },
    { kind: "card", name: "乙", before: { name: "乙", link: "https://b1/" }, after: { name: "乙", link: "https://s.mi.cn/bad" }, fields: [] },
  ],
};
const data = { cards: [{ name: "甲", link: "https://a1/" }, { name: "乙", link: "https://b1/" }], donots: [], rules: { featured: [], logo: [], cardCopy: [], detailSlug: [], regionByName: {} } };

describe("review：Issue 评论 → 合入（crawler/review.mjs 是唯一语义，CI 与 /admin 共用）", () => {
  it("parseCommands：多行 / 逗号 / 全角逗号混排 + all 展开", () => {
    const cmds = parseCommands("/approve card:甲\n/reject card:乙，card:丙");
    expect(cmds).toEqual([
      { action: "approve", id: "card:甲" },
      { action: "reject", id: "card:乙" },
      { action: "reject", id: "card:丙" },
    ]);
    expect(parseCommands("hello").length).toBe(0);
  });

  it("(C) 放宽依据：命令解析面宽于 workflow 的 startsWith —— 大小写/前导空白/夹带说明都认", () => {
    /* 这三条正是旧 job if 会挡掉、而 parseCommands 能吃的形态：触发条件必须退化成只按 label，
       否则「谁都能看懂的审批指令」会在 workflow 层静默失效。 */
    expect(parseCommands("/APPROVE card:甲")).toEqual([{ action: "approve", id: "card:甲" }]);
    expect(parseCommands("   /reject card:乙")).toEqual([{ action: "reject", id: "card:乙" }]);
    expect(parseCommands("核过了，官方地址我打开确认在。\n/approve all")).toEqual([{ action: "approve", id: "all" }]);
    /* 实测裁决：parseCommands 逐行只产 1 条 {approve, all}——`all` 的展开发生在 runReview 层
       （本文件「approve all」例已钉死）， brief 原写的 .toBe(2) 把两层的活记到了同一层账上。
       改断言为「等值整形」而非长度，顺带把「说明行不吃指令」也钉住。 */
    /* 反向：正文里没有指令 → 零命令，runReview 走 changed:false 空跑分支（不会误合任何一条） */
    expect(parseCommands("只是路过评论一句")).toEqual([]);
  });

  it("(C) 空跑兜底：无指令评论 changed=false、零 GitHub 调用、files 为空（放宽触发面的安全前提）", async () => {
    /* 放宽后审核 Issue 下每条评论都会起 review job，「不碰任何东西」必须有牙：
       用记录型 fetchImpl 断言调用数为 0（比注入抛错更硬——抛错只能证明「没走到」，
       记录数能证明早退发生在任何网络 I/O 之前）；files 为空对象，CLI 分支据此不落盘，
       crawl.yml 的提交步骤也就不会遇到 pending/ 缺失（评审 C1 的根因）。 */
    const { fn, calls } = mkFetch(res(201, {}));
    const r = await runReview({
      repo: "me/r", issueNumber: 5, pending, data,
      comment: "核过了，但这条没下指令。\n下一版再议", token: "t", fetchImpl: fn,
    });
    expect(r.changed).toBe(false);
    expect(r.files).toEqual({});
    expect(r.applied).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("approve all：干净的甲合入、脏的乙同批被 validate 拦下 → 整体抛错不落盘（宁可不合，不半合）", async () => {
    await expect(
      runReview({ repo: "me/r", issueNumber: 5, pending, data, comment: "/approve all", token: "t", fetchImpl: async () => res(201, {}) })
    ).rejects.toThrowError(/推广短链域名|拒绝写盘/);
  });

  it("单条 approve：files 四件套、pending 剩一条、回帖 payload 断言、未清空不关 Issue", async () => {
    const { fn, calls } = mkFetch(res(201, {}));
    const r = await runReview({ repo: "me/r", issueNumber: 5, pending, data, comment: "/approve card:甲", token: "t", fetchImpl: fn });
    expect(r.changed).toBe(true);
    expect(r.files["data/tokens.json"]).toContain("https://a2/");
    expect(r.files["pending/changes.json"]).toContain("乙");
    const post = calls[0];
    expect(post.url).toBe("https://api.github.com/repos/me/r/issues/5/comments");
    expect(JSON.parse(post.init.body as string).body).toContain("✅ 通过");
    expect(calls.some((c) => String(c.init.method) === "PATCH")).toBe(false);
  });

  it("reject 最后一条 → pending 清空 → 自动关闭 Issue + changed 仍 true（空档案落盘）", async () => {
    const { fn, calls } = mkFetch(res(201, {}), res(200, {}));
    const r = await runReview({ repo: "me/r", issueNumber: 5, pending: { ...pending, changes: [pending.changes[0]] }, data, comment: "/reject card:甲", token: "t", fetchImpl: fn });
    expect(JSON.parse(r.files["pending/changes.json"])).toMatchObject({ version: 1, changes: [] });
    expect(calls.some((c) => c.init.method === "PATCH" && c.url.endsWith("/issues/5"))).toBe(true);
  });

  it("commandText：同类动作并成一行，且与 parseCommands 互逆（后台生成的指令必须能被自己的解析器读回）", () => {
    const ds = [
      { action: "approve", id: "card:WorkBuddy" },
      { action: "approve", id: "rules:featured" },
      { action: "reject", id: "card:甲" },
    ];
    expect(commandText(ds)).toBe("/approve card:WorkBuddy rules:featured\n/reject card:甲");
    expect(parseCommands(commandText(ds))).toEqual(ds);
    expect(commandText([])).toBe("");
    /* §3 决策 16 C-1：含空白/逗号/引号的 id 必须原样往返。上面三条 fixture id（WorkBuddy / rules:featured /
       甲）恰好全都无空白，所以既有断言对这个缺陷零鉴别力——现库 60 个 id 里 34 个含空白（探针实测）。 */
    const spaced = [
      { action: "approve", id: "card:阿里云 Qoder（灵码）" },
      { action: "reject", id: "watch:火山引擎 Ark 协作计划（字节）" },
    ];
    expect(commandText(spaced)).toBe('/approve "card:阿里云 Qoder（灵码）"\n/reject "watch:火山引擎 Ark 协作计划（字节）"');
    expect(parseCommands(commandText(spaced))).toEqual(spaced);

    /* 现库双引号数为 0，故用合成 id 钉「转义」这条机制本身，而不是等某天真出现带引号的名字 */
    const quoted = [{ action: "approve", id: 'card:他说"好" 的卡片' }];
    expect(parseCommands(commandText(quoted))).toEqual(quoted);

    /* 全量真实 id 往返：名字一律从 data/*.json 取、id 一律由 keyOf 造（§2 单一实现，测试不手搓形状）。
       60 / 34 是数据快照计数，同类于 admin-publish.test.ts 里「写回的卡表是 32 张」——钉的是「这批真实数据
       确实含空白」这个前提；若将来改名令含空白数为 0，下面三条往返仍全跑，只是鉴别力自动降级，不会假绿。 */
    const { cards, donots, rules } = realData();
    const ids = [
      ...cards.map((c: any) => keyOf({ kind: "card", name: c.name })),
      ...donots.map((w: any) => keyOf({ kind: "watch", name: w.name })),
      ...Object.keys(rules).map((n: string) => keyOf({ kind: "rules", name: n })),
    ];
    expect(ids).toHaveLength(60);
    expect(ids.filter((s: string) => /\s/.test(s))).toHaveLength(34);
    const all = ids.map((id: string) => ({ action: "approve", id }));
    expect(parseCommands(commandText(all))).toEqual(all);

    /* 人手在 Issue 里写的旧格式（无引号 + 半角/全角逗号混排）必须继续生效——修 C-1 不能把
       docs/ONLINE-STEPS.md §6 已公开的写法读成碎片。 */
    expect(parseCommands("/approve card:A card:B\n/reject card:C，card:D，card:E")).toEqual([
      { action: "approve", id: "card:A" },
      { action: "approve", id: "card:B" },
      { action: "reject", id: "card:C" },
      { action: "reject", id: "card:D" },
      { action: "reject", id: "card:E" },
    ]);
  });

  it("commit 钩子：只在真合入时调用、拿到的就是 res.files 同一份、且发生在回执之后", async () => {
    const calls: Record<string, any>[] = [];
    const seen: Record<string, any>[] = [];
    const fn = async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init: init as Record<string, any> });
      return res(201, {});
    };
    let files: Record<string, string> | null = null;
    const r = await runReview({
      repo: "me/r", issueNumber: 5, pending, data, comment: "/approve card:甲", token: "t", fetchImpl: fn,
      commit: async (f: Record<string, string>) => {
        seen.push({ keys: Object.keys(f), atCalls: calls.length });
        files = f;
      },
    });
    expect(seen).toEqual([{ keys: ["data/tokens.json", "data/donots.json", "data/rules.json", "pending/changes.json"], atCalls: 1 }]);
    expect(files).toBe(r.files); // 同一引用：不存在「提交 A、落盘 B」
    expect(calls.length).toBe(1); // 只有回执 POST；pending 还剩「乙」，不该关单
  });

  it("校验不过时 commit 一次也不被调用（validateCards 在任何 I/O 之前抛＝宁可不合不半合）", async () => {
    let commits = 0;
    const { fn, calls } = mkFetch(res(201, {}));
    await expect(
      runReview({
        repo: "me/r", issueNumber: 5, pending, data, comment: "/approve all", token: "t", fetchImpl: fn,
        commit: async () => { commits += 1; },
      }),
    ).rejects.toThrowError(/推广短链域名|拒绝写盘/);
    expect(commits).toBe(0);
    expect(calls).toEqual([]); // 脏卡「乙」在 applyDecisions 里就把整批拦下，连回执都不该发
  });

  it("issueNumber 为 0：跳过回执与关单，但 files 与 commit 照常（无审核 Issue 时后台仍可盖章）", async () => {
    const { fn, calls } = mkFetch(res(201, {}));
    let committed: Record<string, string> | null = null;
    const r = await runReview({
      repo: "me/r", issueNumber: 0, pending, data, comment: "/approve card:甲", token: "t", fetchImpl: fn,
      commit: async (f: Record<string, string>) => { committed = f; },
    });
    expect(calls).toEqual([]);
    expect(r.changed).toBe(true);
    expect((committed as unknown as Record<string, string>)["data/tokens.json"]).toContain("https://a2/"); // 只在类型层（§3 决策 15）
    /* §3 决策 16 M-2：上面只钉了「回执被跳过」，closeIssue 半边从没被触达——第一轮的 pending 里还剩「乙」，
       走的仍是「未清空不关单」。这一轮把队列改成只剩干净的甲，批完即清空，才第一次执行
       `if (!res.pending.changes.length) await closeIssue(…)` 那一句；反向证据是既有例「reject 最后一条 →
       自动关闭 Issue」（那里 PATCH 真发生），两条合起来才把「issueNumber 为 0 ⇒ 零 GitHub 写」钉死。 */
    const f2 = mkFetch(res(201, {}));
    let committed2: Record<string, string> | null = null;
    const r2 = await runReview({
      repo: "me/r", issueNumber: 0, pending: { ...pending, changes: [pending.changes[0]] }, data,
      comment: "/approve card:甲", token: "t", fetchImpl: f2.fn,
      commit: async (f: Record<string, string>) => { committed2 = f; },
    });
    expect(r2.pendingLeft).toBe(0);
    expect(f2.calls).toEqual([]); // 队列清空了也不 PATCH——关单守卫真在
    expect(committed2).not.toBeNull(); // 写面不受 issueNumber 影响
  });

  it("reviewGate：名单内 ok、bot 回声 skip、越权与缺 login 都是 denied（缺 login 按 fail-closed 拒）", () => {
    const cfg = { adminLogins: ["hope0719"] };
    expect(reviewGate({ commenter: "hope0719", config: cfg })).toEqual({ verdict: "ok", login: "hope0719", note: "" });
    /* 大小写与首尾空白由 allowlistCheck 归一，此处不重复实现（红线 1）；login 原样回传给日志用 */
    expect(reviewGate({ commenter: " Hope0719 ", config: cfg })).toMatchObject({ verdict: "ok", login: "Hope0719" });
    expect(reviewGate({ commenter: "stranger", config: cfg }).verdict).toBe("denied");
    expect(reviewGate({ commenter: "", config: cfg }).verdict).toBe("denied"); // env 没接到＝谁都不放行
    expect(reviewGate({ commenter: "hope0719", config: { adminLogins: [] } }).verdict).toBe("denied"); // Day-1 未填名单
    /* bot 必须是 skip 而不是 denied：拒绝回执本身是以评论回到同一个 Issue 下的，
       若 bot 走 denied 分支，①失效时「回执→触发→再回执」会无限刷单。 */
    expect(reviewGate({ commenter: "github-actions[bot]", config: cfg })).toEqual({ verdict: "skip", login: "github-actions[bot]", note: "" });
    expect(reviewGate({ commenter: "GITHUB-ACTIONS[BOT]", config: cfg }).verdict).toBe("skip"); // 与 endsWith 同为大小写不敏感
    expect(reviewGate({ commenter: "dependabot[bot]", config: { adminLogins: [] } }).verdict).toBe("skip"); // bot 判定优先于名单
  });

  it("reviewGate 的 denied note 逐字取自 denyNote（Issue 回执与后台 403 页共用一句措辞）", () => {
    const g = reviewGate({ commenter: "stranger", config: { adminLogins: ["hope0719"] } });
    expect(g.note).toBe(denyNote(allowlistCheck({ login: "stranger", logins: ["hope0719"] })));
    expect(g.note).toContain("不在 config/site-config.json 的 adminLogins");
    expect(g.verdict).toBe("denied");
  });
});

/* 整枝终审 #2：CLI 收尾措辞。!res.changed 有两种成因——评论里压根没指令，与有指令但一条都没合入
   （id 未命中 / 已全部处理完）。混印成「评论不含指令」会把后者误导成前者，运维据此以为评论没送进来。
   措辞只影响日志，两种成因都零写盘，后者由上面的空跑兜底例与 applyDecisions 的 missing 语义保证。 */
describe("noChangeNote（CLI 收尾措辞按有无指令二择）", () => {
  it("无指令 → 「不含指令」；有指令但零合入 → 「无可合入项」", () => {
    expect(noChangeNote("随手一句，没写指令")).toBe("评论不含指令，跳过");
    expect(noChangeNote("")).toBe("评论不含指令，跳过");
    expect(noChangeNote("/approve card:不存在")).toContain("无可合入项");
  });
});

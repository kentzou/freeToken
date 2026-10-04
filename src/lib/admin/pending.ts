/** 待审队列的运行时读（§0 裁决：pending 只在运行时 fetch，绝不烘进构建产物）。
 *  三态必须分开：404＝档案已清（正常空队列）／403 与网络＝读不了／形态错＝解析失败按停机处理。
 *  原型 #reviewEmpty 与 #pendingErr 两个视图就靠这三个 kind 分流，混态会让「故障」显示成「一切正常」。 */
import { FIELD_LIMIT, isRemoval, keyOf, kindLabel } from "../../../crawler/diff.mjs";
import { openReviewIssue, readRepoFile } from "../../../crawler/github.mjs";
import { dump } from "../../../crawler/serialize.mjs";
import { classifyError, isAuthError } from "./errors";

type Fetch = (url: any, init?: any) => Promise<any>;

export const PENDING_PATH = "pending/changes.json";

export interface PendingEntry {
  kind: string;
  name: string;
  before: unknown;
  after: unknown;
  fields: { field: string; from: unknown; to: unknown }[];
}

export interface PendingJson {
  version: number;
  upstreamSha: string | null;
  detectedAt: string;
  changes: PendingEntry[];
}

/** 形态校验：四键与 crawler/run.mjs 的 mergePending 写侧同源。认不出的形态一律判错——
 *  把损坏的 pending 看成空队列＝静默丢掉待审变更，这是最坏的一种「成功」。 */
export function parsePending(text: string): PendingJson {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("pending/changes.json 解析失败：不是合法 JSON");
  }
  if (!j || typeof j !== "object" || !Array.isArray(j.changes)) throw new Error("pending/changes.json 形态异常：缺 changes 数组");
  for (const e of j.changes) {
    if (!e || typeof e.kind !== "string" || typeof e.name !== "string") throw new Error("pending/changes.json 形态异常：条目缺 kind/name");
  }
  return {
    version: Number(j.version) || 1,
    upstreamSha: typeof j.upstreamSha === "string" ? j.upstreamSha : null,
    detectedAt: String(j.detectedAt ?? ""),
    changes: j.changes as PendingEntry[],
  };
}

export type PendingResult =
  | { kind: "empty" }
  /** sha/text 与 pending 平级而不是塞进 PendingJson：PendingJson 是「文件内容」的形状，sha 是 Contents API 的元数据。
   *  runReview 会把剩余队列 dump 回这个文件（crawler/review.mjs:103），内容里多一个 sha 就会让每次审批都改写一遍字节，
   *  并让 commitText 的「比对再写」永远失配——那是把防呆改成自证。 */
  | { kind: "loaded"; pending: PendingJson; sha: string; text: string }
  | { kind: "error"; status: number; message: string; hint: string };

export async function loadPending({
  repo,
  token = "",
  fetchImpl = globalThis.fetch,
  sleep,
}: {
  repo: string;
  token?: string;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PendingResult> {
  let r: { kind: "file"; text: string; sha: string } | { kind: "missing" } | { kind: "error"; status: number; message: string };
  try {
    // sleep 只用于把 GET 的三次退避（1s/4s/10s）变成可注入接缝；缺省时 gh() 用真计时器（生产口径不变）
    r = (await readRepoFile(repo, PENDING_PATH, { token, fetchImpl, sleep })) as typeof r;
  } catch (e) {
    const c = classifyError(e); // 传输层抛错（断网/CORS/退避用尽）落第三态：少了这里，UI 会崩在未捕获 rejection 上
    return { kind: "error", status: c.status, message: c.message, hint: c.hint };
  }
  if (r.kind === "missing") return { kind: "empty" };
  if (r.kind === "error") {
    const c = classifyError({ status: r.status, note: r.message });
    return { kind: "error", status: r.status, message: r.message, hint: c.hint };
  }
  try {
    return { kind: "loaded", pending: parsePending(r.text), sha: r.sha, text: r.text };
  } catch (e) {
    return { kind: "error", status: 200, message: (e as Error).message, hint: "解析失败按停机处理：队列内容不可信，绝不能当成空。" };
  }
}

/** id 口径唯一实现是 diff.mjs 的 keyOf，这里只做搬运（`all` 展开与盖章都靠它对齐） */
export const pendingIds = (pending: PendingJson | null) => (pending?.changes ?? []).map(keyOf);

export interface ChangeRow {
  id: string;
  kind: string;
  kindLabel: string;
  name: string;
  removal: boolean;
  /** 规则表条目：diff 给的是「(整表，见 before)」占位文案，逐字段划线会读成两句废话，UI 需换整表口径 */
  whole: boolean;
  fields: { field: string; from: string; to: string }[];
  extraFields: number;
  /** 规则表（`whole`）行的整表前后全文，其余行恒为空串。
   *  规则表的 fields 只有「(整表，见 before)」占位文案，逐字段划线会读成两句废话——
   *  真正要比的内容必须在这里给，且只由 toRows 用 dump 给一次。 */
  beforeText: string;
  afterText: string;
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** 整表全文：null/undefined（那一侧本就没有这张表）折成空串，由 UI 出 `WHOLE_ABSENT`，
 *  而不是把 "null" 渲成一块看起来像数据的方块。序列化只走 dump（§1 红线 5）。 */
const text = (v: unknown) => (v === null || v === undefined ? "" : dump(v));

/** 待审队列 → Tab1 的渲染事实（纯函数：计划 4 只负责把它铺成 .adm-card） */
export function toRows(pending: PendingJson | null): ChangeRow[] {
  return (pending?.changes ?? []).map((e) => {
    const fields = e.fields ?? [];
    const whole = e.kind === "rules";
    return {
      id: keyOf(e),
      kind: e.kind,
      kindLabel: kindLabel(e.kind),
      name: e.name,
      removal: isRemoval(e),
      whole,
      fields: fields.slice(0, FIELD_LIMIT).map((f) => ({ field: f.field, from: cell(f.from), to: cell(f.to) })),
      extraFields: Math.max(0, fields.length - FIELD_LIMIT),
      beforeText: whole ? text(e.before) : "",
      afterText: whole ? text(e.after) : "",
    };
  });
}

/** Tab1 要同时读两样东西：队列（有没有事要做）与开放审核 Issue（做完的事往哪儿留痕）。
 *  两者的失败语义正好相反——readRepoFile 失败是「返回 {kind:"error"}」，openReviewIssue 失败是「抛」
 *  （crawler/github.mjs:248 `throw await httpError(...)`）。并发的两条读必须在这里一次收敛成同一种形状，
 *  不能让 pane 自己去 catch 一个它看不懂的调用层差异。 */
export interface ReviewContext {
  pending: PendingResult;
  /** 0＝没有开放 Issue，或读 Issue 失败：publish.ts 已定「issueNumber 为 0 时跳过回执与关单，写面照常」 */
  issueNumber: number;
  /** Issue 的网页地址（openReviewIssue 回的是 `html_url`），给「打开审核 Issue」外链；读不到是空串 */
  issueUrl: string;
  /** 非空串＝Issue 那条读失败（原文 + hint 已并进来）。它只改批注措辞，绝不构成「队列读不到」 */
  issueNote: string;
  /** 两条读里任一条拿到 401 的归一结果——pane 唯一的「会话已死」判据。
   *  403 不进这里：errors.ts:31 说清了「限流/权限不足清会话会把读不了伪装成登出」。 */
  authFailed: boolean;
}

export async function loadReviewContext({
  repo,
  token = "",
  fetchImpl = globalThis.fetch,
  sleep,
}: {
  repo: string;
  token?: string;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ReviewContext> {
  const [pending, issues] = await Promise.all([
    loadPending({ repo, token, fetchImpl, sleep }),
    openReviewIssue(repo, { token, fetchImpl }).catch((e) => e),
  ]);
  const err = issues instanceof Error ? classifyError(issues) : null;
  const issue = issues instanceof Error ? null : (issues as { number: unknown; url: unknown } | null);
  return {
    pending,
    issueNumber: issue ? Number(issue.number) || 0 : 0,
    issueUrl: issue ? String(issue.url ?? "") : "",
    issueNote: err ? `${err.message}${err.hint ? `（${err.hint}）` : ""}` : "",
    /** 「该不该算会话已死」不在这里判数字：isAuthError 是 errors.ts 里那条口径的唯一出口，
     *  它读的就是对象上的 status，所以 PendingResult 的错误支、classifyError 的产物、甚至 null 都能直接喂。 */
    authFailed: (pending.kind === "error" && isAuthError(pending)) || isAuthError(err),
  };
}

/** 待审队列的运行时读（§0 裁决：pending 只在运行时 fetch，绝不烘进构建产物）。
 *  三态必须分开：404＝档案已清（正常空队列）／403 与网络＝读不了／形态错＝解析失败按停机处理。
 *  原型 #reviewEmpty 与 #pendingErr 两个视图就靠这三个 kind 分流，混态会让「故障」显示成「一切正常」。 */
import { FIELD_LIMIT, isRemoval, keyOf, kindLabel } from "../../../crawler/diff.mjs";
import { readRepoFile } from "../../../crawler/github.mjs";
import { classifyError } from "./errors";

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

export type PendingResult = { kind: "empty" } | { kind: "loaded"; pending: PendingJson } | { kind: "error"; status: number; message: string; hint: string };

export async function loadPending({ repo, token = "", fetchImpl = globalThis.fetch }: { repo: string; token?: string; fetchImpl?: Fetch }): Promise<PendingResult> {
  const r = (await readRepoFile(repo, PENDING_PATH, { token, fetchImpl })) as
    | { kind: "file"; text: string }
    | { kind: "missing" }
    | { kind: "error"; status: number; message: string };
  if (r.kind === "missing") return { kind: "empty" };
  if (r.kind === "error") {
    const c = classifyError({ status: r.status, note: r.message });
    return { kind: "error", status: r.status, message: r.message, hint: c.hint };
  }
  try {
    return { kind: "loaded", pending: parsePending(r.text) };
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
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

/** 待审队列 → Tab1 的渲染事实（纯函数：计划 4 只负责把它铺成 .adm-card） */
export function toRows(pending: PendingJson | null): ChangeRow[] {
  return (pending?.changes ?? []).map((e) => {
    const fields = e.fields ?? [];
    return {
      id: keyOf(e),
      kind: e.kind,
      kindLabel: kindLabel(e.kind),
      name: e.name,
      removal: isRemoval(e),
      whole: e.kind === "rules",
      fields: fields.slice(0, FIELD_LIMIT).map((f) => ({ field: f.field, from: cell(f.from), to: cell(f.to) })),
      extraFields: Math.max(0, fields.length - FIELD_LIMIT),
    };
  });
}

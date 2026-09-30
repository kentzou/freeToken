/** 运行时读面：Contents API 是唯一能带凭据的仓库文件读通道（raw.githubusercontent.com 带 token 会被拒），
 *  同域静态文件（构建产物）另走 readSameOrigin。两者都只认「事实三态」，判断留给上层。 */
import { readRepoFile, writeRepoFile } from "../../../crawler/github.mjs";
import { classifyError } from "./errors";

type Fetch = (url: any, init?: any) => Promise<any>;

/** 三态即全部事实：ok 带原文、missing 专指 404（档案不存在）、error 必带可诊断 hint。
 *  上层不许再自己判 status——那会把「读不了」和「没有」重新混到一起。 */
export type SameOriginResult =
  | { kind: "ok"; text: string }
  | { kind: "missing" }
  | { kind: "error"; status: number; message: string; hint: string };

/** 同域文件读取的唯一实现：fetch 抛错（断网/CORS）与 404（没这个文件）必须分流——
 *  混成「空」会让后台以为档案已清，把真故障读成正常态。 */
export async function readSameOrigin(rel: string, { fetchImpl = globalThis.fetch }: { fetchImpl?: Fetch } = {}): Promise<SameOriginResult> {
  let r: any;
  try {
    r = await fetchImpl(rel);
  } catch (e) {
    return { kind: "error", status: 0, message: `同域读取失败：${rel}`, hint: classifyError(e).hint };
  }
  if (r.status === 404) return { kind: "missing" };
  if (!r.ok) return { kind: "error", status: r.status, message: `HTTP ${r.status}`, hint: classifyError({ status: r.status, note: `HTTP ${r.status}` }).hint };
  return { kind: "ok", text: String(await r.text()) };
}

export const DATA_PATHS = { cards: "data/tokens.json", donots: "data/donots.json", rules: "data/rules.json" } as const;

/** Contents 读封装：必须成功的场景用它（要么拿到文本，要么带着分类原因抛）。
 *  pending 那种「404 是正常态」的走 loadPending，别把两种语义塞进同一个函数。 */
export async function readTextFile(
  repo: string,
  path: string,
  { token = "", fetchImpl = globalThis.fetch }: { token?: string; fetchImpl?: Fetch } = {},
): Promise<{ text: string; sha: string }> {
  const r = (await readRepoFile(repo, path, { token, fetchImpl })) as
    | { kind: "file"; text: string; sha: string }
    | { kind: "missing" }
    | { kind: "error"; status: number; message: string };
  if (r.kind === "file") return { text: r.text, sha: r.sha };
  const e = r.kind === "missing" ? new Error(`仓库文件不存在：${path}`) : new Error(`读取 ${path} 失败：HTTP ${r.status} ${r.message}`);
  Object.assign(e, { status: r.kind === "missing" ? 404 : r.status, note: r.kind === "missing" ? "" : r.message });
  throw e;
}

/** 盖章前必须有「当前线上数据」：applyDecisions 是对整表操作的，缺任一片段就不能合（宁可不合不半合）。 */
export async function loadCurrentData(repo: string, { token = "", fetchImpl = globalThis.fetch }: { token?: string; fetchImpl?: Fetch } = {}) {
  const [cards, donots, rules] = await Promise.all([
    readTextFile(repo, DATA_PATHS.cards, { token, fetchImpl }),
    readTextFile(repo, DATA_PATHS.donots, { token, fetchImpl }),
    readTextFile(repo, DATA_PATHS.rules, { token, fetchImpl }),
  ]);
  return {
    cards: JSON.parse(cards.text),
    donots: JSON.parse(donots.text),
    rules: JSON.parse(rules.text),
    shas: { [DATA_PATHS.cards]: cards.sha, [DATA_PATHS.donots]: donots.sha, [DATA_PATHS.rules]: rules.sha } as Record<string, string>,
  };
}

export interface CommitInput {
  repo: string;
  path: string;
  text: string;
  message: string;
  token?: string;
  fetchImpl?: Fetch;
  /** 同一轮里已读到的远端原文与 sha（省一次请求）；不给则本函数自己读。 */
  current?: { text: string; sha: string };
}

/** 「比对再写」：远端逐字相同 → 不 PUT。理由不是省流量——序列化出口是 dump，
 *  一旦比对被跳过，一次「点了保存但没改任何东西」就会在 git 历史里留一次纯格式重排的提交。 */
export async function commitText({ repo, path, text, message, token = "", fetchImpl = globalThis.fetch, current }: CommitInput) {
  const cur = (current ? { kind: "file", text: current.text, sha: current.sha } : await readRepoFile(repo, path, { token, fetchImpl })) as {
    kind: string;
    text?: string;
    sha?: string;
  };
  if (cur.kind === "file" && cur.text === text) return { kind: "unchanged" as const, sha: String(cur.sha) };
  const sha = cur.kind === "file" ? String(cur.sha) : ""; // 新建不带 sha；带了指令更新会 422
  const r = await writeRepoFile(repo, path, { message, text, sha, token, fetchImpl });
  return { kind: "committed" as const, commitSha: r.commitSha, contentSha: r.contentSha };
}

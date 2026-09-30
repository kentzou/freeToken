/** 假应答层：与 tests/github.test.ts 原实现逐字同语义（调用层只依赖 ok/status/json/text）。
 *  resText 的 json() 故意抛——用来证明代码真的只读了 text()（计划 3 的 device flow 容错回落形态）。 */
export interface FakeRes {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export function res(status: number, body: unknown = {}): FakeRes {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

export function resText(status: number, text: string): FakeRes {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("假应答：只该走 text()");
    },
    text: async () => text,
  };
}

export function mkFetch(...responses: unknown[]) {
  const calls: { url: string; init: Record<string, any> }[] = [];
  let i = 0;
  // 返回类型注为 Promise<any>：新导出函数的 fetchImpl 缺省 globalThis.fetch 被推导为 typeof fetch，
  // Promise<unknown> 不可赋值；any 只改类型层，运行时语义与原实现逐字一致
  const fn = async (url: unknown, init: unknown): Promise<any> => {
    calls.push({ url: String(url), init: init as Record<string, any> });
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

export const noSleep = () => async () => {};

/** 取请求头（大小写按实现写入的原样键） */
export const hdr = (c: { init: Record<string, any> }, k: string) => (c.init.headers as Record<string, string>)[k];

/** 取 JSON 请求体（form 编码的调用请用 bodyOf 直读字符串） */
export const jsonOf = (c: { init: Record<string, any> }) => JSON.parse(c.init.body as string);

/** 取失败应答：`await fn().catch(x => x)` 之后统一按 any 读 status/note（github.mjs 挂在 Error 上身） */
export const fail = (x: unknown) => x as { message: string; status?: number; note?: string };

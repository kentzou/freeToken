/** 变现配置（Tab2）的读写：读走 Contents，写走「比对再写」，序列化只认 dump。
 *  写入侧比读取侧严格：crawler/clean.mjs 的 applySiteConfig 对未知键是静默忽略，
 *  配置页若照单全收就会显示「已保存」而管线根本没读到——所以未知键在这里直接拒。 */
import { parseLogins } from "../../../crawler/allowlist.mjs";
import { dump } from "../../../crawler/serialize.mjs";
import type { CardOverrides, SiteConfig } from "../types";
import { commitText, readTextFile } from "./remote";

export const CONFIG_PATH = "config/site-config.json";

/** applySiteConfig 实际消费的逐卡 patch 白名单（type + link + POOL_KEYS + hide） */
export const PATCH_KEYS = ["type", "link", "inviteBase", "inviteCodes", "inviteParam", "traeLinks", "hide"] as const;

/** 分类三档的唯一口径：与 src/lib/catalog.ts 的 catOf 返回值域一致 */
export const TYPE_VALUES = ["大模型", "工具", "项目"] as const;

export interface ConfigPatch {
  wechatId?: string;
  githubRepo?: string;
  oauthClientId?: string;
  /** 一行输入：分隔口径交给 parseLogins（与 Issue 评论同一把刀） */
  adminLoginsText?: string;
  cards?: Record<string, Partial<CardOverrides>>;
}

export async function loadSiteConfig({ repo, token = "", fetchImpl }: { repo: string; token?: string; fetchImpl?: (url: any, init?: any) => Promise<any> }) {
  const r = await readTextFile(repo, CONFIG_PATH, { token, fetchImpl });
  return { config: JSON.parse(r.text) as SiteConfig, text: r.text, sha: r.sha };
}

/** 纯函数：返回新对象、不改入参；键序沿用原 config 的插入序（dump 的字节可比对全靠这点） */
export function patchSiteConfig(config: SiteConfig, patch: ConfigPatch): SiteConfig {
  const next: SiteConfig = { ...config };
  for (const k of ["wechatId", "githubRepo", "oauthClientId"] as const) {
    if (patch[k] !== undefined) (next as Record<string, unknown>)[k] = String(patch[k]).trim();
  }
  if (patch.adminLoginsText !== undefined) next.adminLogins = parseLogins(patch.adminLoginsText);
  const cards: Record<string, CardOverrides> = { ...(config.cards ?? {}) };
  for (const [name, overrides] of Object.entries(patch.cards ?? {})) {
    const cur = { ...(cards[name] ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(overrides)) {
      if (!(PATCH_KEYS as readonly string[]).includes(k)) throw new Error(`未知配置键：${k}（管线不认，写了等于没写）`);
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete cur[k];
      else cur[k] = v;
    }
    if (Object.keys(cur).length) cards[name] = cur as CardOverrides;
    else delete cards[name]; // 空覆盖条目不留壳：{} 会在 diff 与告警里各制造一次噪声
  }
  next.cards = cards;
  return next;
}

/** 写前校验：返回错误列表（空＝可提交）。规则表只查「会不会把管线读崩」的必要条件，不做美化式校验。 */
export function validateConfigShape(config: SiteConfig): string[] {
  const errs: string[] = [];
  if (config.githubRepo !== undefined && config.githubRepo && !/^[^/\s]+\/[^/\s]+$/.test(config.githubRepo))
    errs.push(`githubRepo 需形如 owner/repo，当前「${config.githubRepo}」`);
  for (const l of config.adminLogins ?? []) if (!l || /[\s/]/.test(l)) errs.push(`adminLogins 有非法 login：「${l}」`);
  for (const [name, o] of Object.entries(config.cards ?? {})) {
    for (const k of Object.keys(o)) if (!(PATCH_KEYS as readonly string[]).includes(k)) errs.push(`卡「${name}」有未知键 ${k}`);
    if (o.hide !== undefined && typeof o.hide !== "boolean") errs.push(`卡「${name}」的 hide 必须是布尔`);
    if (o.type !== undefined && !(TYPE_VALUES as readonly string[]).includes(o.type))
      errs.push(`卡「${name}」的 type 必须是 ${TYPE_VALUES.join("/")}，当前「${o.type}」`);
    if (o.inviteCodes !== undefined && !Array.isArray(o.inviteCodes)) errs.push(`卡「${name}」的 inviteCodes 必须是数组`);
  }
  return errs;
}

export interface ConfigRow {
  name: string;
  /** 该卡当前的分类现值，来自调用方传入的受版 `type`；空串＝本行没有现值依据（UI 显示「—」，绝不猜） */
  category: string;
  /** 后台填的分类覆盖；未覆盖为空串 */
  type: string;
  link: string;
  inviteBase: string;
  inviteCodes: string;
  inviteParam: string;
  hidden: boolean;
  /** 除 hide 之外还有没有覆盖（UI 用它区分「仅隐藏」与「有链接改写」两类行） */
  overridden: boolean;
}

/** Tab2 的逐卡行（顺序＝配置文件键序，不做二次排序：站长认的是仓库里那份文件的顺序）。
 *  typesByName＝受版数据里每张卡的现值 type，由调用方（AdminApp 经 Contents 读 data/tokens.json）传入。
 *  为什么不在这里自己读盘：① 本文件会被客户端组件 import，node:fs 在浏览器不可达；
 *  ② 构建产物 out/ 里没有 data/ 目录（实测：out 只有各页 HTML + assets + _next），客户端也 fetch 不到自家数据。
 *  默认参数 = HEAD 既有调用点 `configRows(base)` 保持单参可编译。 */
export function configRows(config: SiteConfig, typesByName: Record<string, string> = {}): ConfigRow[] {
  return Object.entries(config.cards ?? {}).map(([name, o]) => ({
    name,
    category: typesByName[name] ?? "",
    type: o.type ?? "",
    link: o.link ?? "",
    inviteBase: o.inviteBase ?? "",
    inviteCodes: (o.inviteCodes ?? []).join(", "),
    inviteParam: o.inviteParam ?? "",
    hidden: o.hide === true,
    overridden: Object.keys(o).some((k) => k !== "hide"),
  }));
}

/** 保存＝先校验再比对再写：任何一条校验不过都整体失败，绝不 PUT 半截配置。 */
export async function saveSiteConfig({
  repo,
  config,
  patch,
  message,
  remote,
  token = "",
  fetchImpl,
}: {
  repo: string;
  config: SiteConfig;
  patch: ConfigPatch;
  message: string;
  remote?: { text: string; sha: string };
  token?: string;
  fetchImpl?: (url: any, init?: any) => Promise<any>;
}) {
  const next = patchSiteConfig(config, patch);
  const errs = validateConfigShape(next);
  if (errs.length) throw new Error(`配置校验失败：${errs.join("；")}`);
  return commitText({ repo, path: CONFIG_PATH, text: dump(next), message, current: remote, token, fetchImpl });
}

/** spec §3 的 Tab2「commit payload 预览」＝saveSiteConfig 的前半截单独导出。
 *  它必须与真 PUT 的 content 同源（同一个 dump(patchSiteConfig(...))）：预览若自成一派，
 *  管理员看到的是一套装得下的 JSON、提交下去的是另一套，预览就从「防呆」变成「自证清白」。
 *  校验不在这里做——预览允许看到「还没保存」的形态，拦住它的是 saveSiteConfig。 */
export function configPayloadPreview(config: SiteConfig, patch: ConfigPatch): string {
  return dump(patchSiteConfig(config, patch));
}

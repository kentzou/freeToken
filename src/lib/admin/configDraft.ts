/** 变现配置的换算层：受版现值 → 编辑草稿 → 只含改动的 ConfigPatch。
 *  为什么值得单独一层：saveSiteConfig 的 patch 是「增量」语义（空串删键、空条目删卡），
 *  把整份草稿原样递过去会把没动的卡也重写一遍，一次保存制造 N 处无意义差异；
 *  而漏递一个键就是「界面显示已保存、线上没变化」——两种错都只能在这一层防。 */
import type { ConfigPatch, ConfigRow } from "./config";
import type { CardOverrides } from "../types"; // 执行期 D10：config.ts:6 自己也是从 ../types 引它，且不 re-export——本层要 `as CardOverrides` 就得自己引

export interface DraftItem {
  link: string;
  inviteBase: string;
  inviteCodes: string;
  inviteParam: string;
  /** ""＝不覆盖（沿用受版 category）；三档取值由 config.ts 的 TYPE_VALUES 定，本层不另写一份名单 */
  type: string;
  hidden: boolean;
}

export interface ConfigBase {
  wechatId: string;
  adminLoginsText: string;
}

export interface Draft {
  base: ConfigBase;
  wechatId: string;
  adminLoginsText: string;
  cards: Record<string, DraftItem>;
}

/** 逗号/全角逗号/顿号/空白都是分隔符（执行期 D8 校正：原注释说「与 parseLogins 同一把刀」不成立——
 *  allowlist.mjs:8 的 parseLogins 只切 /[\s,，]+/，**不含顿号**；邀请码里顿号是分隔符，名单里顿号是非法字符，
 *  两个函数各服务各的字段，故意不同。别把这里改成同一把刀，也别拿它当名单分隔的口径来源——
 *  名单的分歧口径以 config.ts 里 patchSiteConfig 实际调用的 parseLogins 为准）。 */
const splitCodes = (v: string) => String(v).split(/[\s,，、]+/).filter(Boolean);

export function draftFrom(base: ConfigBase, rows: ConfigRow[]): Draft {
  const cards: Record<string, DraftItem> = {};
  for (const r of rows)
    cards[r.name] = { link: r.link, inviteBase: r.inviteBase, inviteCodes: r.inviteCodes, inviteParam: r.inviteParam, type: r.type, hidden: r.hidden };
  return { base, wechatId: base.wechatId, adminLoginsText: base.adminLoginsText, cards };
}

function cardDiff(row: ConfigRow, d: DraftItem): Partial<Record<string, unknown>> {
  const out: Partial<Record<string, unknown>> = {};
  if (d.link !== row.link) out.link = d.link;
  if (d.inviteBase !== row.inviteBase) out.inviteBase = d.inviteBase;
  if (d.inviteParam !== row.inviteParam) out.inviteParam = d.inviteParam;
  if (d.type !== row.type) out.type = d.type;
  if (d.hidden !== row.hidden) out.hide = d.hidden;
  /** 现值是「, 」连接的展示形态，比对也用它自己的展示形态：拿 split 后的数组比字符串会把没动的行判成有动 */
  if (splitCodes(d.inviteCodes).join(", ") !== row.inviteCodes) out.inviteCodes = splitCodes(d.inviteCodes);
  return out;
}

export function buildPatch(draft: Draft, rows: ConfigRow[]): ConfigPatch {
  const patch: ConfigPatch = {};
  if (draft.wechatId !== draft.base.wechatId) patch.wechatId = draft.wechatId;
  if (draft.adminLoginsText !== draft.base.adminLoginsText) patch.adminLoginsText = draft.adminLoginsText;
  const cards: ConfigPatch["cards"] = {};
  for (const row of rows) {
    const d = draft.cards[row.name];
    if (!d) continue; // 草稿里没有这张卡＝这一轮不碰它（新增卡不走这条路）
    const diff = cardDiff(row, d);
    if (Object.keys(diff).length) cards[row.name] = diff as CardOverrides; // 执行期 D10：原写 `as never`——它能过编译，代价是这条赋值从此没有任何编译期检查（`never` 可赋给任意类型，写错键名、类型不匹配都不会红；运行期只靠 config.ts:42 的白名单抛错兜）。cardDiff 产出的键全在 CardOverrides 的值域内（type/link/inviteBase/inviteCodes: string[]/inviteParam/hide: boolean），落到真实类型上才是「有牙」的写法
  }
  if (Object.keys(cards).length) patch.cards = cards;
  return patch;
}

export function hasPatch(p: ConfigPatch): boolean {
  return p.wechatId !== undefined || p.adminLoginsText !== undefined || Boolean(p.cards && Object.keys(p.cards).length);
}

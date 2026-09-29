/** crawler/adapt.mjs 的类型声明（仅供 tsc 与测试消费，运行时零影响）。
 *  上游 item 用索引签名放宽：data.json 实测 28 个键，适配层只读其中 7 个。 */
export interface UpstreamItem {
  name?: string;
  category?: string;
  modality?: string;
  quota?: string;
  entry_url?: string;
  intel_url?: string;
  validity?: string | null;
  last_verified?: string;
  sponsored?: boolean;
  [key: string]: unknown;
}

/** 事实补丁 = 上游每轮刷新的 7 键（决策 Q1 事实层） */
export interface FactPatch {
  name: string;
  type: string;
  modality: string;
  quota: string;
  link: string;
  limited: string | null;
  updated: string;
}

export const NAME_ALIAS: Record<string, string>;
export const CATEGORY_TO_TYPE: Record<string, string>;
export const FACT_FIELDS: (keyof FactPatch)[];

export function adaptItem(item: UpstreamItem | null | undefined): FactPatch | null;
export function adaptItems(
  items: (UpstreamItem | null | undefined)[],
  prevCards: { name: string; [key: string]: unknown }[]
): Record<string, unknown>[];

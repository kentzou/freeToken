/** Tab2「变现配置」：逐卡覆盖已有卡片的展示字段，只把改动增量提交回 config/site-config.json。
 *  本文件只讲布局：每一种态该说什么，全部来自 uiModel（§1 红线 1）；换算（草稿→patch）在 configDraft。
 *  不加 "use client"：AdminApp 是后台唯一的客户端边界，pane 随它进客户端图。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TYPE_VALUES, configPayloadPreview, configRows, loadSiteConfig, saveSiteConfig } from "@/lib/admin/config";
import type { ConfigRow } from "@/lib/admin/config";
import { buildPatch, draftFrom, hasPatch } from "@/lib/admin/configDraft";
import type { Draft, DraftItem } from "@/lib/admin/configDraft";
import { classifyError } from "@/lib/admin/errors";
import { loadCurrentData } from "@/lib/admin/remote";
import { catOf } from "@/lib/catalog";
import { ADD_CARD_NOTE, CATEGORY_UNSET_META, CONFIG_LOADING_TEXT, NO_CHANGE_NOTE, SAVE_BUTTON, TYPE_UNSET, TYPE_UNSET_META, configSaved, errorBar, hideAriaLabel, inviteAriaLabel } from "@/lib/admin/uiModel";
import type { ErrorBar, Receipt } from "@/lib/admin/uiModel";
import type { SiteConfig } from "@/lib/types";
import type { PaneCtx } from "./AdminApp";
import { ErrorNotice, ReceiptBar } from "./PaneAtoms";

/** D5：transport 在 pane 里只出现这一行（AdminApp 的 FETCH 未导出，跨文件拿不到）。
 *  每个数据面调用都把它当实参显式传下去，与 ReviewPane 同一「每 pane 自备一行」口径（§1 红线 3）。 */
const FETCH = globalThis.fetch.bind(globalThis);

/** 纯组件：给定行、草稿与回执渲页面。措辞全部来自 uiModel（红线 1），本文件只讲布局。 */
export interface ConfigFormProps {
  rows: ConfigRow[];
  draft: Draft;
  preview: string;
  busy: boolean;
  dirty: boolean;
  receipt: Receipt | null;
  error: ErrorBar | null;
  onRow: (name: string, key: keyof DraftItem, value: string | boolean) => void;
  onGlobal: (key: "wechatId" | "adminLoginsText", value: string) => void;
  onSave: () => void;
}

export function ConfigForm({ rows, draft, preview, busy, dirty, receipt, error, onRow, onGlobal, onSave }: ConfigFormProps) {
  const types = [TYPE_UNSET, ...TYPE_VALUES];
  return (
    <div aria-busy={busy}>
      <ReceiptBar receipt={receipt} />
      {error ? <ErrorNotice bar={error} /> : null}
      <div className="adm-card">
        <h3>基础配置</h3>
        <div className="adm-field">
          <label htmlFor="cfg-wechat">站长微信号</label>
          <input id="cfg-wechat" className="adm-select" type="text" value={draft.wechatId} disabled={busy} onChange={(e) => onGlobal("wechatId", e.target.value)} />
        </div>
        <div className="adm-field">
          <label htmlFor="cfg-logins">白名单 login（逗号或空格分隔）</label>
          <input id="cfg-logins" className="adm-select" type="text" value={draft.adminLoginsText} disabled={busy} onChange={(e) => onGlobal("adminLoginsText", e.target.value)} />
          <span className="adm-hint">把自己移出名单会立刻失去后台访问权，保存前请确认名单里还有别人。</span>
        </div>
        <p className="adm-sub">逐卡覆盖（链接 / 邀请码 / 分类 / 隐藏）</p>
        <div>
          {rows.map((r) => {
            const d = draft.cards[r.name];
            return (
              <div className="adm-row" key={r.name}>
                <div className="adm-meta">
                  <div>{r.name}</div>
                  <div className="adm-mono">受版分类：{r.category || CATEGORY_UNSET_META} · 现覆盖：{r.type || TYPE_UNSET_META}</div>
                </div>
                <input className="adm-invite" type="text" aria-label={inviteAriaLabel(r.name)} placeholder="邀请码（可选）" value={d.inviteCodes} disabled={busy} onChange={(e) => onRow(r.name, "inviteCodes", e.target.value)} />
                <select className="adm-select" aria-label={`${r.name} 分类覆盖`} value={d.type} disabled={busy} onChange={(e) => onRow(r.name, "type", e.target.value)}>
                  {types.map((t, i) => (
                    <option key={t} value={i === 0 ? "" : t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button type="button" className="adm-sw" role="switch" aria-checked={d.hidden} aria-label={hideAriaLabel(r.name)} disabled={busy} onClick={() => onRow(r.name, "hidden", !d.hidden)} />
              </div>
            );
          })}
        </div>
        <p className="adm-why">{ADD_CARD_NOTE}</p>
        <div className="adm-acts">
          <button type="button" className="btn-primary" disabled={busy || !dirty} onClick={onSave}>
            {SAVE_BUTTON}
          </button>
          {!dirty ? <span className="adm-hint">{NO_CHANGE_NOTE}</span> : null}
        </div>
        {dirty ? (
          <>
            <p className="adm-sub">将提交的内容（与真 PUT 的正文逐字同源）</p>
            <pre>{preview}</pre>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ConfigPane({ ctx }: { ctx: PaneCtx }) {
  const { repo, token } = ctx;
  const [rows, setRows] = useState<ConfigRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [snap, setSnap] = useState<{ config: SiteConfig; text: string; sha: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<ErrorBar | null>(null);
  const sink = useRef({ onExpired: ctx.onExpired });
  sink.current = { onExpired: ctx.onExpired };

  /** 读面失败的唯一处理器：措辞主体是 configLoad（「配置读取失败」）——读取失败不许说成「保存失败」（D6/§1 红线 7）。
   *  写面失败另有其出口：save() 自己的 catch 用 "config"（「保存失败」），两者不共用一条 bar。 */
  const reportReadFailure = useCallback((e: unknown) => {
    const c = classifyError(e);
    setError(errorBar("configLoad", c.message, c.status, c.hint));
    if (c.kind === "auth") sink.current.onExpired(c.message);
  }, []);

  const reload = useCallback(async () => {
    // 每次读取起步先清空上一次的错误条：重试成功后若仍挂着「配置读取失败」即为撒谎（D15）。
    // 不在这里清 receipt——那是 save 自己的信号，save() 已在顶部置空。
    setError(null);
    try {
      const [c, cur] = await Promise.all([
        loadSiteConfig({ repo, token, fetchImpl: FETCH }),
        loadCurrentData(repo, { token, fetchImpl: FETCH }).catch(() => null), // 拿不到受版分类不拦配置面：那一列显「未标注」
      ]);
      const typesByName: Record<string, string> = {};
      for (const card of cur?.cards ?? []) typesByName[String((card as { name?: unknown }).name ?? "")] = catOf(card as Parameters<typeof catOf>[0]);
      const nextRows = configRows(c.config, typesByName);
      setSnap(c);
      setRows(nextRows);
      setDraft(draftFrom({ wechatId: c.config.wechatId ?? "", adminLoginsText: (c.config.adminLogins ?? []).join(", ") }, nextRows));
    } catch (e) {
      reportReadFailure(e);
    }
  }, [repo, token, reportReadFailure]);

  const booted = useRef("");
  useEffect(() => {
    const key = `${repo}|${token}`;
    if (booted.current === key) return;
    booted.current = key;
    void reload();
  }, [reload, repo, token]);

  const patch = useMemo(() => (rows && draft ? buildPatch(draft, rows) : {}), [draft, rows]);
  const dirty = hasPatch(patch);
  const preview = useMemo(() => (snap && dirty ? configPayloadPreview(snap.config, patch) : ""), [patch, snap, dirty]);

  const onRow = useCallback((name: string, key: keyof DraftItem, value: string | boolean) => {
    setDraft((prev) => (prev ? { ...prev, cards: { ...prev.cards, [name]: { ...prev.cards[name], [key]: value } } } : prev));
  }, []);
  const onGlobal = useCallback((key: "wechatId" | "adminLoginsText", value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const save = useCallback(async () => {
    if (!snap || !rows || !dirty || busy) return;
    setBusy(true);
    setReceipt(null);
    setError(null);
    try {
      const res = await saveSiteConfig({ repo, config: snap.config, patch, message: "chore(admin): 更新变现配置", remote: { text: snap.text, sha: snap.sha }, token, fetchImpl: FETCH });
      setReceipt(configSaved(res as { kind: string }));
      // 保存后以远端为准重算现值：否则「已保存」和行里的旧值同时挂在屏幕上。重读留在 try 内，busy 期间控件保持禁用。
      // 重读失败由 reload 自己按 configLoad 上报（PUT 已成功却显「保存失败」正是 D6/§1 红线 7 禁的措辞撒谎），这里的 catch 只接 saveSiteConfig 本身的失败。
      await reload();
    } catch (e) {
      const c = classifyError(e);
      setError(errorBar("config", c.message, c.status, c.hint));
      if (c.kind === "auth") sink.current.onExpired(c.message);
    } finally {
      setBusy(false);
    }
  }, [busy, dirty, patch, reload, repo, rows, snap, token]);

  if (!rows || !draft) {
    if (error)
      return (
        <div aria-busy={busy}>
          <ErrorNotice bar={error} busy={busy} onReload={() => void reload()} />
        </div>
      );
    return (
      <div className="adm-card" role="status">
        <p className="adm-why">{CONFIG_LOADING_TEXT}</p>
        <p className="adm-skeleton" />
      </div>
    );
  }
  return <ConfigForm rows={rows} draft={draft} preview={preview} busy={busy} dirty={dirty} receipt={receipt} error={error} onRow={onRow} onGlobal={onGlobal} onSave={() => void save()} />;
}

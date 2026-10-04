/** pane 之间共用的三件展示原子。本文件零措辞、零判断：
 *  文案与色档一律由 src/lib/admin/uiModel.ts 的纯函数算好（§1 红线 1），这里只做「把结构渲对」。
 *  为什么单独一个文件而不是各 pane 自己写一遍：见计划 §5 评审口径「不得逐字重复一段逻辑」。 */
import type { ReactNode } from "react";
import { RETRY_BUTTON } from "@/lib/admin/uiModel";
import type { ErrorBar, Receipt } from "@/lib/admin/uiModel";

/** 回执条：bad 才是 alert，其余是 status——把成功回执也标成 alert，读屏会在每次正常保存后打断用户。 */
export function ReceiptBar({ receipt }: { receipt: Receipt | null }) {
  if (!receipt) return null;
  return (
    <div className={`adm-statebar ${receipt.tone}`} role={receipt.tone === "bad" ? "alert" : "status"}>
      <p style={{ margin: 0 }}>{receipt.text}</p>
      {receipt.lines.length ? (
        <ul className="adm-receipt">
          {receipt.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 错误条：条 + hint +「可选的重试」。三处同形（Tab1 错误支、Tab2 首屏读取失败、Tab4 错误支）只写这一遍。
 *  onReload 省略时不出按钮——Tab2 的表单在读取成功后仍可能在保存时吃到 4xx，
 *  那时候「重新读取」会把用户刚填的草稿整个丢掉，给按钮等于诱导入职。 */
export function ErrorNotice({ bar, busy, onReload }: { bar: ErrorBar; busy?: boolean; onReload?: () => void }) {
  return (
    <>
      <p className={bar.className} role={bar.role}>
        {bar.text}
      </p>
      {bar.hint ? <p className="adm-why">{bar.hint}</p> : null}
      {onReload ? (
        <div className="adm-acts">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onReload}>
            {RETRY_BUTTON}
          </button>
        </div>
      ) : null}
    </>
  );
}

/** 整页空态：邮戳 + 标题 + 一句话 + 可选脚注。邮戳复用 app.css 的 .stamp（Task 5 的 .adm-stampbox 负责把它从绝对定位拽回流内），
 *  这里不引 StampBadge——它把「已核验 + 日期」焊死在自己的 JSX 里，后台这两格要说的是「档案已清 / 无记录」。 */
export function EmptyNotice({ stamp, heading, note, footer }: { stamp: string; heading: string; note: string; footer?: ReactNode }) {
  return (
    <div className="adm-nf">
      <div className="adm-stampbox">
        <div className="stamp" aria-hidden="true">
          <span className="stamp-inner">
            <strong>{stamp}</strong>
          </span>
        </div>
      </div>
      <h1>{heading}</h1>
      <p>{note}</p>
      {footer}
    </div>
  );
}

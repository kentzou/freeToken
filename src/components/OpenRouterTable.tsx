import type { OpenRouterLedgerModel } from "@/lib/types";

/** OpenRouter 台账模型表：models 为空时不渲染空表头，只给空态
 * （空台账来自数据缺席，此时渲染一张「有列无行」的表头是假事实） */
export default function OpenRouterTable({ models }: { models: OpenRouterLedgerModel[] }) {
  if (!models.length) {
    return (
      <div className="empty-state">
        <p>台账暂无数据</p>
        <p className="hint">OpenRouter 抓取器每日自动更新台账，入库后即可在此查看。</p>
      </div>
    );
  }
  return (
    <div className="or-wrap">
      <table className="or-table">
        <thead>
          <tr>
            <th>模型</th>
            <th>名称</th>
            <th>上下文</th>
            <th>最大输出</th>
            <th>模态</th>
            <th>免费判据</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td>{m.id}</td>
              <td className="or-name">{m.name}</td>
              <td>{m.contextLength ?? "—"}</td>
              <td>{m.maxCompletionTokens ?? "—"}</td>
              <td>{m.modality ?? "—"}</td>
              {/* 两条判据分开标记：:free 变体与单价为 0 满足其一即入选，逐条如实显示 */}
              <td>
                <span className={m.freeVariant ? "or-badge or-yes" : "or-badge"}>
                  {m.freeVariant ? ":free 变体" : "无 :free 变体"}
                </span>
                <span className={m.tokenPriceZero ? "or-badge or-yes" : "or-badge"}>
                  {m.tokenPriceZero ? "单价为 0" : "单价不为 0"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

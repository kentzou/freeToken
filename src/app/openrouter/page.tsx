import PageShell from "@/components/PageShell";
import OpenRouterTable from "@/components/OpenRouterTable";
import { loadCatalog } from "@/lib/data.server";
import { canonicalHref } from "@/lib/href";

export const metadata = {
  title: "OpenRouter 免费模型台账 · Token 情报局",
  alternates: { canonical: canonicalHref("/openrouter") },
};

export default function OpenRouterPage() {
  const { openrouter } = loadCatalog();
  const q = openrouter.quotaPolicy;
  const empty = !openrouter.models.length;
  /* 额度口径：数值全部从台账 quotaPolicy 字段读，页面不另写一份副本。
     scraped=false 表示这些数字是抓取器代码里的常量（接口不返回额度），需人工核对来源。 */
  const quotaPoints = empty
    ? []
    : [
        `账号级 ${q.requestsPerMinute} 次/分钟`,
        `credits 低于 ${q.creditsThreshold} 每日 ${q.requestsPerDay.lessThanCreditsThreshold} 次；达到 ${q.creditsThreshold} 每日 ${q.requestsPerDay.atLeastCreditsThreshold} 次`,
        q.reset,
        q.note,
      ];

  return (
    <PageShell title="OpenRouter 免费模型台账">
      {empty ? (
        <p>台账暂无数据。抓取器每日自动更新，入库后此页会自动显示台账与模型表。</p>
      ) : (
        <>
          <h2 className="detail-title">事实</h2>
          <table className="fact-table">
            <tbody>
              <tr>
                <th>抓取时间</th>
                <td>{openrouter.fetchedAt}</td>
              </tr>
              <tr>
                <th>免费模型</th>
                <td>
                  {openrouter.freeModelCount} / {openrouter.totalModels}
                </td>
              </tr>
              <tr>
                <th>数据源</th>
                <td>
                  <a href={openrouter.source}>{openrouter.source}</a>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className="detail-title">额度口径</h2>
          <ul className="model-list">
            {quotaPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {/* scraped 为 false：额度数字是代码常量而非抓取所得，必须向读者交代口径与出处 */}
          {q.scraped === false && (
            <p className="detail-note">
              额度口径为人工维护{q.verifiedAt ? `（核验于 ${q.verifiedAt}）` : ""}，见{" "}
              {q.source ? <a href={q.source}>来源</a> : "来源"}。
            </p>
          )}

          <h2 className="detail-title">免费模型</h2>
          <OpenRouterTable models={openrouter.models} />
        </>
      )}
    </PageShell>
  );
}

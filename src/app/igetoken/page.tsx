import PageShell from "@/components/PageShell";
import { loadCatalog } from "@/lib/data.server";
import { canonicalHref } from "@/lib/href";

export const metadata = {
  title: "iGetoken 快讯速览 · Token 情报局",
  alternates: { canonical: canonicalHref("/igetoken") },
};

/** 栏目顺序与显示名（键与 crawler 侧 IGETOKEN_SECTIONS 同集合）。
 *  计数按 items 现算，不读台账的 sections 字段——旧台账没这个字段时页面照样正确。 */
const SECTIONS: { key: "deals" | "models" | "perks"; label: string }[] = [
  { key: "deals", label: "活动快讯" },
  { key: "models", label: "新平台上线" },
  { key: "perks", label: "积分福利" },
];

export default function IgetokenPage() {
  const { igetoken } = loadCatalog();
  const empty = !igetoken.items.length;

  return (
    <PageShell title="iGetoken 快讯">
      {empty ? (
        <p>暂无快讯数据。抓取器每日更新官方 RSS，台账入库后此页会自动显示标题与原文链接。</p>
      ) : (
        <>
          <h2 className="detail-title">事实</h2>
          <table className="fact-table">
            <tbody>
              <tr>
                <th>抓取时间</th>
                <td>{igetoken.fetchedAt}</td>
              </tr>
              <tr>
                <th>快讯条数</th>
                <td>
                  {igetoken.itemCount}（
                  {SECTIONS.map((s) => `${s.label} ${igetoken.items.filter((i) => i.section === s.key).length}`).join(" · ")}）
                </td>
              </tr>
              <tr>
                <th>数据源</th>
                <td>
                  <a href={igetoken.source}>{igetoken.sourceName} 官方 RSS</a>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 版权口径：本页是跳转索引，只登记标题/链接/日期，不转载正文——向读者明示，见台账 rightsNote */}
          <p className="detail-note">{igetoken.rightsNote}</p>

          {SECTIONS.map((s) => {
            const items = igetoken.items.filter((i) => i.section === s.key);
            if (!items.length) return null; // 上游哪天清空某栏目，这一节整块消失而不是留个空标题
            return (
              <section key={s.key}>
                <h2 className="detail-title">
                  {s.label}（{items.length} 条，按日期倒序）
                </h2>
                <ul className="model-list">
                  {items.map((it) => (
                    <li key={it.id}>
                      <time dateTime={it.date}>{it.date}</time>{" "}
                      <a href={it.link}>{it.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </PageShell>
  );
}

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

/** 平台台账的类别档位（键取自 igetoken /models/ 页面自己的 filter；出现新档位按原值展示）。
 *  顺序＝先国内、再聚合网关、最后海外：本站读者多数在国内网络环境下取号。 */
const PLATFORM_CATEGORIES: { key: string; label: string }[] = [
  { key: "domestic", label: "国内直连" },
  { key: "aggregator", label: "聚合网关" },
  { key: "overseas", label: "海外" },
];

export default function IgetokenPage() {
  const { igetoken, igetokenPlatforms } = loadCatalog();
  const empty = !igetoken.items.length;
  /* 平台索引只上架「身份与出处」四项事实（name/category/checkedAt/url）——
     配额与摘要留在台账里不渲染：那是对方的编辑产物，未过本站红线②（见 crawler/igetoken.mjs 文件头）。 */
  const platformGroups = PLATFORM_CATEGORIES.map((c) => ({
    ...c,
    items: igetokenPlatforms.platforms.filter((p) => p.category === c.key),
  })).filter((g) => g.items.length > 0);
  const unknownCategories = igetokenPlatforms.platforms.filter(
    (p) => !PLATFORM_CATEGORIES.some((c) => c.key === p.category)
  );

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

      {/* 平台索引：本站此前从未公开过这块数据（台账只进仓库、不进页面）。
          公开面刻意只上架四项事实，配额文案不上架、也不据此立卡——理由写在下面这段读者可见的注释里，
          与 crawler/igetoken.mjs 文件头的红线②一致：额度原句须在厂商官方页逐字在场。 */}
      {igetokenPlatforms.platforms.length > 0 && (
        <section>
          <h2 className="detail-title">
            平台索引（{igetokenPlatforms.platformCount} 家 · 截至 {igetokenPlatforms.fetchedAt.slice(0, 10)}）
          </h2>
          <p className="detail-note">
            {igetokenPlatforms.rightsNote}
            本页只登记「平台名 · 类别 · 对方核实日期 · 出处链接」四项事实：额度文案是对方编辑产物，未过本站取证红线，
            因此<strong>不搬运、也不据此立卡</strong>；本站卡片库只收在厂商官方页能逐字取证的条目。
            点开出处页可看对方给出的额度与领取方式，最终以厂商官方控制台为准。
          </p>
          {platformGroups.map((g) => (
            <div key={g.key}>
              <h3 className="detail-title">
                {g.label}（{g.items.length} 家）
              </h3>
              <ul className="model-list">
                {g.items.map((p) => (
                  <li key={p.slug}>
                    <a href={p.url}>{p.name}</a> <span className="detail-note">{p.checkedAt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {unknownCategories.length > 0 && (
            <div>
              <h3 className="detail-title">其他（{unknownCategories.length} 家）</h3>
              <ul className="model-list">
                {unknownCategories.map((p) => (
                  <li key={p.slug}>
                    <a href={p.url}>{p.name}</a> <span className="detail-note">{p.checkedAt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </PageShell>
  );
}

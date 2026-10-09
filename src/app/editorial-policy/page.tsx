import PageShell from "@/components/PageShell";
import { loadCatalog } from "@/lib/data.server";
import { canonicalHref } from "@/lib/href";

export const metadata = {
  title: "精选门槛与收录标准 · Token 情报局",
  alternates: { canonical: canonicalHref("/editorial-policy") },
};

export default function EditorialPolicy() {
  const { compiled } = loadCatalog();
  return (
    <PageShell title="精选门槛与收录标准">
      <p>
        首页只展示提供下列门槛型号（或同系列更高版本）的平台。低于门槛的型号不进入首页，避免「免费」二字误导到弱模型上。
      </p>
      <ul className="model-list">
        {compiled.featured.map((r) => (
          <li key={r.label}>{r.label}</li>
        ))}
      </ul>
      <p>
        「观望名单」是另一套判定：平台能用但性价比、速度或稳定性存在明确短板，我们会写明理由，不做推荐。
        每条情报的核验日期来自上游更新时间，本站不擅自改写。
        另有少数情报是本站一手核验的<strong>本地增补卡</strong>：这类条目的核验日期由本站逐条填写，
        来源页面与额度原文登记在仓库的 <code>config/local-cards.json</code>。
      </p>
      <p>
        链接清洗规则：剥除 <code>userCode</code>、<code>invite_code</code>、<code>aff</code>、<code>keyfrom</code>、<code>utm_*</code> 等推广与追踪参数；
        上游作者的邀请码池与推广短链一律不入库。少数条目指向本站参与的活动页、带上本站的活动码，
        这类链接一律标 <code>sponsored</code>（向搜索引擎声明非自然链），码值公开登记在仓库的清洗器里。
      </p>
    </PageShell>
  );
}

import PageShell from "@/components/PageShell";
import { loadCatalog } from "@/lib/data.server";

export const metadata = { title: "精选门槛与收录标准 · Token 情报局" };

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
      </p>
      <p>链接清洗规则：剥除 <code>userCode</code>、<code>invite_code</code>、<code>aff</code>、<code>keyfrom</code>、<code>utm_*</code> 等推广与追踪参数；邀请码池与推广短链一律不入库。</p>
    </PageShell>
  );
}

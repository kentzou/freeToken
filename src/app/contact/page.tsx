import PageShell from "@/components/PageShell";
import { canonicalHref } from "@/lib/href";

export const metadata = {
  title: "联系与投稿 · Token 情报局",
  alternates: { canonical: canonicalHref("/contact") },
};

export default function Contact() {
  return (
    <PageShell title="联系与投稿">
      <p>
        发现额度失效、信息过时或有新的免费平台需要收录，最省事的方式是在仓库提 Issue（标题写平台名，正文写清楚现状）。
      </p>
      <p>我们不接受付费上榜；合作条目会显式标注「推广」。管理后台上线后，此处会同步审批入口。</p>
    </PageShell>
  );
}

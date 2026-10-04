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
      <p>
        我们不接受付费上榜；合作条目会显式标注「推广」。管理后台位于{" "}
        <code>/admin/</code>：仅对白名单内的 GitHub 账号开放，走 GitHub Device Flow 登录，本站不代理账号、不保存任何密码。
        条目纠错与收录请求仍走仓库 Issue —— 那是唯一对所有读者开放的通道，后台不是给读者提交意见的入口。
      </p>
    </PageShell>
  );
}

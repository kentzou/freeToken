import PageShell from "@/components/PageShell";
import { pageHref } from "@/lib/href";

export const metadata = {
  title: "隐私与数据处理 · Token 情报局",
  alternates: { canonical: pageHref("/privacy") },
};

export default function Privacy() {
  return (
    <PageShell title="隐私与数据处理">
      <p>本站是纯静态站点，不写入 Cookie，不做用户画像，不接入第三方统计或广告脚本。</p>
      <p>
        本地存储（localStorage）只有一项：主题选择（键 <code>tfb-theme</code>）。不存在其它缓存或追踪键；清空浏览器数据即可彻底移除，不需要向我们提交请求。
      </p>
      <p>
        点击「立即领取」会离开本站前往平台官网，其后的行为受各平台隐私政策约束。
      </p>
    </PageShell>
  );
}

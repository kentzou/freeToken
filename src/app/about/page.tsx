import PageShell from "@/components/PageShell";
import { pageHref } from "@/lib/href";

export const metadata = {
  title: "关于 · Token 情报局",
  alternates: { canonical: pageHref("/about") },
};

export default function About() {
  return (
    <PageShell title="关于 Token 情报局">
      <p>
        这是一个非官方的爱好者项目：把散落在各家平台的<strong>免费 AI 额度</strong>集中核验，用一份可读的「报纸」呈现出来。
        内容源自 <code>hope0719/token-fbi</code> 公开镜像，本站负责抓取、清洗、核验日期标注与版面重排。
      </p>
      <p>
        我们不售卖额度、不代收费用；所有「立即领取」都直接前往平台官方页面。页面中不追加第三方推广参数，
        上游夹带的邀请码在入库前由清洗器剥离。
      </p>
      <p>
        内容版权归原站作者。若原站需要下架某条情报，可在 Issue 中说明，我们会在下一个同步周期处理。
      </p>
    </PageShell>
  );
}

import { latestUpdated, isoWeek, visibleCards } from "@/lib/catalog";
import { loadCatalog } from "@/lib/data.server";
import { pageHref } from "@/lib/href";

/** 页脚自带数据依赖，不接受 props：三处调用点因此不可能写出互相矛盾的「最近更新」 */
export default function SiteFooter() {
  const { cards, donots, compiled, meta } = loadCatalog();
  const now = new Date();
  /* 取可见集里最晚的核验日期，而不是构建时间戳——本地种子 lastSyncedAt 永远是「今天」，会虚报新鲜度 */
  const latest = latestUpdated(visibleCards(cards, donots, compiled));
  return (
    <footer className="site-footer">
      <p>
        <strong>Token 情报局</strong> · 非官方爱好者项目 · 内容版权归原站作者
      </p>
      <p className="footer-note">
        数据源自 hope0719/token-fbi 公开镜像，抓取后经推广参数清洗；最近核验 {latest}（第 {isoWeek(now)} 期）·
        同步于 {meta.lastSyncedAt.slice(0, 10)}。
      </p>
      <nav className="footer-links" aria-label="站点信息">
        <a href={pageHref("/about/")}>关于</a>
        <a href={pageHref("/editorial-policy/")}>精选门槛</a>
        <a href={pageHref("/privacy/")}>隐私</a>
        <a href={pageHref("/contact/")}>联系</a>
      </nav>
    </footer>
  );
}

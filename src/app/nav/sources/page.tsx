import type { Metadata } from "next";
import SiteHeaderLite from "@/components/SiteHeaderLite";
import SiteFooter from "@/components/SiteFooter";
import { loadNavTools } from "@/lib/nav-data";
import { canonicalHref, pageHref } from "@/lib/href";

export const metadata: Metadata = {
  title: "数据来源与透明度｜AI 工具导航",
  description: "本站 AI 工具数据的来源站清单、各站收录数、抓取时间，以及未收录站点的原因说明。",
  alternates: { canonical: canonicalHref("/nav/sources") },
};

/** 来源页：透明度核心页。
 *  如实展示已收录站 + 未收录站（含原因），是「真实性优先」原则的对外兑现。 */
export default function SourcesPage() {
  const { index } = loadNavTools();
  const ok = index.sites.filter((s) => s.status === "ok");
  const empty = index.sites.filter((s) => s.status === "empty");
  const skipped = index.sites.filter((s) => s.status === "skipped");

  return (
    <div className="page">
      <SiteHeaderLite />
      <main id="main">
        <div className="nav-channel">
          <header className="nav-hero">
            <p className="crumb"><a href={pageHref("/nav/")}>AI 导航</a> / 数据来源</p>
            <h1>数据来源与透明度</h1>
            <p className="deck">
              本站工具条目来自公开 AI 目录站的<strong>列表页聚合</strong>，只抓取名称、简介、链接、分类等公开信息，
              不抓取正文图文。以下是完整来源清单，包括<strong>未能收录的站点及原因</strong>。
            </p>
          </header>

          <section className="nav-block" aria-labelledby="ok-title">
            <h2 id="ok-title">已收录来源（{ok.length} 站）</h2>
            <table className="src-table">
              <thead>
                <tr>
                  <th>来源站</th>
                  <th>地址</th>
                  <th>收录条目</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {ok.map((s) => (
                  <tr key={s.siteId}>
                    <td><strong>{s.name}</strong></td>
                    <td><a href={s.home} target="_blank" rel="noopener noreferrer">{s.home.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></td>
                    <td className="num">{s.count}</td>
                    <td className="note">{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {empty.length ? (
            <section className="nav-block" aria-labelledby="empty-title">
              <h2 id="empty-title">已抓取但暂无数据（{empty.length} 站）</h2>
              <ul className="skip-list">
                {empty.map((s) => (
                  <li key={s.siteId}>
                    <strong>{s.name}</strong>
                    <span className="skip-why">{s.note || "抓取成功但未解析出条目"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {skipped.length ? (
            <section className="nav-block" aria-labelledby="skip-title">
              <h2 id="skip-title">未收录来源（{skipped.length} 站）</h2>
              <p className="block-note">
                以下站点因网络不可达或结构不适用而<strong>未收录</strong>。我们<strong>不会为凑数而虚构条目</strong>；
                若在你的网络环境下可达，可自行运行爬虫补齐。
              </p>
              <ul className="skip-list">
                {skipped.map((s) => (
                  <li key={s.siteId}>
                    <strong>{s.name}</strong>
                    <a className="skip-home" href={s.home} target="_blank" rel="noopener noreferrer">{s.home}</a>
                    <span className="skip-why">{s.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="nav-block" aria-labelledby="policy-title">
            <h2 id="policy-title">抓取与合规</h2>
            <ul className="policy-list">
              <li>只抓取列表页公开信息（名称/简介/链接/分类/图标），不抓正文图文。</li>
              <li>请求间隔 ≥1.5 秒，遵守 robots.txt，UA 标识本站身份。</li>
              <li>每条工具在详情页标注来源站与抓取时间，可点击回原页核对。</li>
              <li>定价字段由简介文本推断，页面明确标注「推断」，不冒充官方口径。</li>
              <li>如需申请收录或更正，请通过
                <a href="https://github.com/" target="_blank" rel="noopener noreferrer"> GitHub Issue</a> 提交。
              </li>
            </ul>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

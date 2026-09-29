import { pageHref } from "@/lib/href";

export default function NotFound() {
  return (
    <div className="page">
      <main id="main" className="prose">
        <h1>这一期里没有这份情报</h1>
        <p>它可能已下架，或链接被改写了。<a href={pageHref("/")}>回到首页</a>看今日已核验的条目。</p>
      </main>
    </div>
  );
}

import PageShell from "@/components/PageShell";
import { canonicalHref } from "@/lib/href";

export const metadata = {
  title: "隐私与数据处理 · Token 情报局",
  alternates: { canonical: canonicalHref("/privacy") },
};

export default function Privacy() {
  return (
    <PageShell title="隐私与数据处理">
      <p>本站是纯静态站点，不写入 Cookie，不做用户画像，不接入第三方统计或广告脚本。</p>
      <p>
        本地存储（localStorage）只有一项：主题选择（键 <code>tfb-theme</code>）。不存在其它缓存或追踪键；清空浏览器数据即可彻底移除，不需要向我们提交请求。
      </p>
      <p>
        管理后台（<code>/admin/</code>）另用了一项浏览器会话存储（sessionStorage，键{" "}
        <code>tfn.admin.session</code>）：里面存的是 GitHub Device Flow 换到的访问令牌，以及随令牌一并写入的 GitHub 用户名、头像地址、授权范围与到期时间。
        它只在这一浏览器标签页存活期间存在，关闭标签页即随之消失。本站没有账号数据库，也没有自建服务器，登录状态不存在服务端。
      </p>
      <p>
        后台页面声明不进取索引面（<code>noindex</code>，且不进站点地图），但隐藏不等于安全：只有配置白名单里的 GitHub
        账号能通过身份核对，而这个账号的权限由你自己在 GitHub 侧授予与撤销。管理员在后台做的每一项改动都会成为公开仓库里一次可追溯的真实提交。
      </p>
      <p>
        点击「立即领取」会离开本站前往平台官网，其后的行为受各平台隐私政策约束。
      </p>
    </PageShell>
  );
}

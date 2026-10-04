/** 外壳只断言「静态渲得出什么」：首屏必须是 checking 而不是登录页（否则每次刷新都闪一次登录），
 *  配置缺失必须先禁再解释（不能发一个注定 404 的请求），拒绝页必须把真实 login 与 hint 渲出来（红线 7），
 *  tablist 必须只有一个可聚焦落点、非当前面板必须带 hidden。
 *  点击与键盘不在这里测——那是 tabs.ts 的 reducer（Task 3）与阶段 F 的裸 CDP。 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHECKING_STATE, type AdminState } from "@/lib/admin/auth";
import DeniedPanel from "@/app/admin/DeniedPanel";
import LoginPanel from "@/app/admin/LoginPanel";
import Workbench from "@/app/admin/Workbench";
import { FIRST_TAB } from "@/lib/admin/tabs";

/** 只改要改的键：其余四键沿用 CHECKING_STATE，避免每个用例重抄一遍空串（也免得漏键被 tsc 抓住） */
const st = (over: Partial<AdminState>): AdminState => ({ ...CHECKING_STATE, ...over });

describe("登录侧", () => {
  it("checking 首屏不出现「管理后台登录」标题（防闪登录页），且带 role=status——仓名尚未回来时也一样", () => {
    const html = renderToStaticMarkup(<LoginPanel view={CHECKING_STATE} repo="" clientIdMissing={false} flow={null} polling={null} onStart={() => {}} />);
    expect(html).toContain("正在核对登录状态…");
    expect(html).not.toContain("管理后台登录");
    expect(html).toContain('role="status"');
  });
  it("noRepo：引导条点名两个构建期变量，按钮 disabled 且三步清单不渲（不发注定失败的请求）", () => {
    const html = renderToStaticMarkup(<LoginPanel view={st({ view: "login" })} repo="" clientIdMissing={false} flow={null} polling={null} onStart={() => {}} />);
    expect(html).toContain("后台尚未配置仓库地址");
    expect(html).toContain("NEXT_PUBLIC_SITE_URL");
    expect(html).toContain("disabled");
    expect(html).not.toContain("github.com/login/device");
  });
  it("unconfigured：搬运 resolveView 的真实 hint，而不是另造一句「登录失败」", () => {
    const html = renderToStaticMarkup(
      <LoginPanel view={st({ view: "unconfigured", hint: "后台未配置 oauthClientId：先在 config/site-config.json 填入 OAuth App 的 client_id" })} repo="a/b" clientIdMissing flow={null} polling={null} onStart={() => {}} />,
    );
    expect(html).toContain("后台尚未配置");
    expect(html).toContain("config/site-config.json");
    expect(html).toContain("disabled");
    expect(html).not.toContain("github.com/login/device");
  });
  it("正常登录页三步齐全（步骤一是文档常量 URL，步骤三是真按钮），等待条按 GitHub 的 interval 陈述节奏", () => {
    const html = renderToStaticMarkup(<LoginPanel view={st({ view: "login" })} repo="a/b" clientIdMissing={false} flow={null} polling={{ interval: 5 }} onStart={() => {}} />);
    for (const step of ["github.com/login/device", "一次性代码", "发起 Device Flow 登录"]) expect(html).toContain(step);
    expect(html).toContain("每 5 秒向 GitHub 核对一次");
  });
  it("拿到设备码后：渲真实 userCode 与真实 verificationUri，按钮收起（同一次登录不许有两个发起入口）", () => {
    const html = renderToStaticMarkup(
      <LoginPanel
        view={st({ view: "login" })}
        repo="a/b"
        clientIdMissing={false}
        flow={{ userCode: "ABCD-1234", verificationUri: "https://github.com/login/device" }}
        polling={{ interval: 8 }}
        onStart={() => {}}
      />,
    );
    expect(html).toContain("ABCD-1234");
    expect(html).toContain('href="https://github.com/login/device"');
    expect(html).not.toContain("发起 Device Flow 登录");
    expect(html).toContain("每 8 秒");
  });
  it("expired 首屏给「登录已过期」＋可重新发起，绝不留白（留白会被读成后台坏了）", () => {
    const html = renderToStaticMarkup(<LoginPanel view={st({ view: "expired", hint: "GitHub 已拒绝该凭证（401）：请重新完成 Device Flow 登录" })} repo="a/b" clientIdMissing={false} flow={null} polling={null} onStart={() => {}} />);
    expect(html).toContain("登录已过期");
    expect(html).toContain("GitHub 已拒绝该凭证");
    expect(html).toContain("发起 Device Flow 登录");
  });
});

describe("拒绝页与工作台", () => {
  it("拒绝页渲出真实 login 与 hint，并带 403 大邮戳（复用 .stamp，不新造第三套）", () => {
    const html = renderToStaticMarkup(<DeniedPanel state={{ view: "denied", login: "octocat", avatarUrl: "", scope: "", hint: "login 不在名单" }} />);
    expect(html).toContain("octocat");
    expect(html).toContain("login 不在名单");
    expect(html).toContain('class="stamp"');
    expect(html).toContain("403");
  });
  it("tablist 四标签、只有一个 tabindex=0、非当前三个面板带 hidden、当前面板才渲 children", () => {
    const html = renderToStaticMarkup(
      <Workbench state={st({ view: "ready", login: "homesong", scope: "public_repo" })} active={FIRST_TAB} focusKey={FIRST_TAB} pendingCount={3} onKey={() => {}} onTab={() => {}} onLogout={() => {}}>
        <div data-pane="review">审查区</div>
      </Workbench>,
    );
    expect(html.match(/role="tab"/g)?.length).toBe(4);
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html.match(/role="tabpanel"/g)?.length).toBe(4);
    expect(html.match(/hidden=""/g)?.length).toBe(3);
    expect(html.split("审查区").length - 1).toBe(1); // children 只注入当前面板，四份＝四倍 DOM
    expect(html).toContain('>待审变更<span class="n">3</span>');
    expect(html).toContain("@homesong");
  });
  it("expired 黄条的措辞逐字来自 uiModel（组件里不许自造过期文案）", () => {
    const html = renderToStaticMarkup(
      <Workbench state={st({ view: "expired", login: "homesong", hint: "GitHub 已拒绝该凭证（401）：请重新完成 Device Flow 登录" })} active={FIRST_TAB} focusKey={FIRST_TAB} pendingCount={0} onKey={() => {}} onTab={() => {}} onLogout={() => {}}>
        <div />
      </Workbench>,
    );
    expect(html).toContain("关页即失效属预期行为");
    expect(html).toContain("GitHub 已拒绝该凭证");
    expect(html).toContain('class="adm-statebar warn"');
    expect(readFileSync("src/app/admin/Workbench.tsx", "utf8")).toContain("expiredBarText");
  });
});

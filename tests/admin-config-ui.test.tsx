/** 只测渲染事实：脏不脏决定按钮能不能点、预览是不是逐字来自 configPayloadPreview、开关的 aria-checked 跟不跟着草稿。 */
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configRows } from "@/lib/admin/config";
import { draftFrom } from "@/lib/admin/configDraft";
import ConfigPane, { ConfigForm } from "@/app/admin/ConfigPane";
import type { PaneCtx } from "@/app/admin/AdminApp";
import { memoryStorage } from "@/lib/admin/session";
import { ADD_CARD_NOTE, CONFIG_LOADING_TEXT, NO_CHANGE_NOTE, SAVE_BUTTON, TYPE_UNSET } from "@/lib/admin/uiModel";
import type { SiteConfig } from "@/lib/types";

const cfg = JSON.parse(readFileSync("config/site-config.json", "utf8")) as SiteConfig;
const rows = configRows(cfg);
const base = { wechatId: cfg.wechatId ?? "", adminLoginsText: (cfg.adminLogins ?? []).join(", ") };
const form = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <ConfigForm
      rows={rows}
      draft={draftFrom(base, rows)}
      preview=""
      busy={false}
      dirty={false}
      receipt={null}
      error={null}
      onRow={() => {}}
      onGlobal={() => {}}
      onSave={() => {}}
      {...over}
    />,
  );

describe("ConfigForm", () => {
  it("一卡一行，行数等于配置里的卡数", () => {
    expect(form().split('class="adm-row"').length - 1).toBe(rows.length);
  });
  it("没改动＝保存禁用 + 「没有待保存的改动」；改动后两者都收起", () => {
    expect(form()).toContain("disabled=\"\"");
    expect(form()).toContain(NO_CHANGE_NOTE);
    const dirty = form({ dirty: true, preview: "{}" });
    expect(dirty).not.toContain(NO_CHANGE_NOTE);
    expect(dirty).toContain(SAVE_BUTTON);
  });
  it("预览逐字来自 configPayloadPreview，组件不再格式化一次", () => {
    const p = '{\n  "cards": {}\n}\n';
    const html = form({ dirty: true, preview: p });
    expect(html).toContain("<pre>{");
    /** 执行期 D2（V28）：文本节点里的双引号被 React 转义成 `&quot;`，原写作 `toContain(p.trim().slice(0, 12))`
     *  那条切片含两个字面 `"`，对不上真实 DOM——实测 `renderToStaticMarkup(<pre>{"${'{\\n  \"cards\": {}''}"}</pre>)`
     *  产出 `<pre>{\n  &quot;cards&quot;: {}\n}</pre>`。断言照转义后的形态写，**不许反过来改 preview 的构造**。
     *  这条对 Tab3/Tab4 同理：凡在 `<pre>`／文本节点里断言含引号的串，都要先过一遍 `replace(/"/g, "&quot;")`。 */
    expect(html).toContain(p.trim().slice(0, 12).replace(/"/g, "&quot;"));
  });
  it("分类下拉四档：三档取值 + 「不覆盖」，与 TYPE_VALUES 同源", () => {
    const html = form();
    for (const t of ["大模型", "工具", "项目", TYPE_UNSET]) expect(html).toContain(`>${t}</option>`);
  });
  it("开关用 role=switch + aria-checked，键盘可达（不是把 checkbox 藏进按钮）", () => {
    const html = form();
    expect(html).toContain('role="switch"');
    expect(html.match(/aria-checked="(true|false)"/g)?.length).toBe(rows.length);
  });
  it("busy 时所有可操作控件一律禁用，整块 aria-busy", () => {
    const html = form({ busy: true });
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/<input/g)?.length).toBe(2 + rows.length);
    /** 执行期 D3：禁用件＝两个全局 input + 每行（邀请码 input、分类 select、隐藏 switch）三件 + **保存键一件**
     *  （`disabled={busy || !dirty}`，busy 为真时它必然也禁用——「busy 时所有可操作控件一律禁用」这句判据
     *  若漏掉保存键，就等于放任「转圈时还能再点一次保存」。实测 rows.length＝11 ⇒ 2 + 33 + 1 = 36，
     *  原公式 `2 + rows.length * 3` 少算那枚，落地时不要把它「修回」35。 */
    expect(html.match(/disabled=""/g)?.length).toBe(2 + rows.length * 3 + 1);
  });
  it("「新增卡不在这里做」那句话在页面上，不是只写在计划里", () => {
    expect(form()).toContain(ADD_CARD_NOTE);
  });
  it("容器首帧＝读取中而不是空态：措辞出自 uiModel，此时零按钮、零「保存失败」", () => {
    const ctx: PaneCtx = {
      repo: "hope0719/token-fbi",
      token: "t",
      login: "u",
      storage: memoryStorage(),
      config: null,
      onExpired: () => {},
    };
    const html = renderToStaticMarkup(<ConfigPane ctx={ctx} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('class="adm-skeleton"');
    expect(html).toContain(CONFIG_LOADING_TEXT);
    expect(html).toContain("正在读取 config/site-config.json…");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("保存失败");
  });
});

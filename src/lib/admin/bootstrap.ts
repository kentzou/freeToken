/** 后台寻址（§3 D4）：读 config 之前必须先知道仓名，而 config 就在要被读的仓里。
 *  三级取值：NEXT_PUBLIC_REPO（显式覆盖，留给自定义域）→ NEXT_PUBLIC_SITE_URL 反推 → 空串（不可用）。
 *  `process.env.NEXT_PUBLIC_*` 是编译期内联，读取 NEXT_PUBLIC_* 不违反 §1 红线 2（那是给 window/Date.now 立的规矩）。 */

/** 惰性 × 字面量：两个约束必须同时满足（执行期 C6 定稿形态）。
 *  键写成字面成员表达式 ⇒ Next 客户端构建才会内联；读取放进函数 ⇒ vitest 才会每次重读。 */
const envRepo = () => String(process.env.NEXT_PUBLIC_REPO ?? "").trim();
const envSiteUrl = () => String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();

/** Pages 标准地址形如 https://<owner>.github.io/<repo>/；其余形态（自定义域、根域）一律认不出。 */
export function deriveRepo(siteUrl: string): string {
  const m = /^https?:\/\/([^/.]+)\.github\.io\/([^/?#]+)\/?$/i.exec((siteUrl || "").trim());
  if (!m) return "";
  const host = m[1];
  const repo = m[2];
  if (!host || !repo || repo === "github.io") return "";
  const owner = host.endsWith(".github.io") ? host.slice(0, -".github.io".length) : host; // 只取第一段，自定义子域不猜
  return owner && repo ? `${owner}/${repo}` : "";
}

export function bootstrapRepo(): string {
  const override = envRepo();
  if (override.includes("/")) return override;
  return deriveRepo(envSiteUrl());
}

/** config 里也允许写 githubRepo（计划 3 的字段）。两者都有值却不一致时，写面会落到「以哪个为准」猜错的地方，
 *  所以这里不静默择一，交上层显式报警。 */
export function repoMismatch(fromBuild: string, fromConfig: string): string {
  const a = String(fromBuild || "").trim();
  const b = String(fromConfig || "").trim();
  if (!a || !b || a === b) return "";
  return `仓库地址冲突：config/site-config.json 写的是 ${b}，构建期为 ${a}。写操作只会落到其一，请核对后统一。`;
}

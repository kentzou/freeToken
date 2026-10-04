/** 后台寻址（§3 D4）：读 config 之前必须先知道仓名，而 config 就在要被读的仓里。
 *  三级取值：NEXT_PUBLIC_REPO（显式覆盖，留给自定义域）→ NEXT_PUBLIC_SITE_URL 反推 → 空串（不可用）。
 *  `process.env.NEXT_PUBLIC_*` 是编译期内联，读取 NEXT_PUBLIC_* 不违反 §1 红线 2（那是给 window/Date.now 立的规矩）。 */

/** 惰性读取环境变量（计划 5 D4 实施细节）：NEXT_PUBLIC_* 在 vitest 是运行时读取、在客户端 bundle 由 Next 内联字面属性访问。
 *  放在模块顶层常量会在首次 import 时固化，「先设后删」的寻址用例就再也读不到改动；
 *  推迟到调用点读取，两种环境语义都成立。 */
const env = (k: string) => String(process.env[k] ?? "").trim();

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
  const override = env("NEXT_PUBLIC_REPO");
  if (override.includes("/")) return override;
  return deriveRepo(env("NEXT_PUBLIC_SITE_URL"));
}

/** config 里也允许写 githubRepo（计划 3 的字段）。两者都有值却不一致时，写面会落到「以哪个为准」猜错的地方，
 *  所以这里不静默择一，交上层显式报警。 */
export function repoMismatch(fromBuild: string, fromConfig: string): string {
  const a = String(fromBuild || "").trim();
  const b = String(fromConfig || "").trim();
  if (!a || !b || a === b) return "";
  return `仓库地址冲突：config/site-config.json 写的是 ${b}，构建期为 ${a}。写操作只会落到其一，请核对后统一。`;
}

/** SITE_URL 的反推需要暴露给测试的第二个入口（deriveRepo 收参数，这里给当前构建期值） */
export const siteRepo = () => deriveRepo(env("NEXT_PUBLIC_SITE_URL"));

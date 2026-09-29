/** 种子可复现红线（终审遗留 #3）：同一输入连跑两次 buildSeed，三产物序列化逐字节一致。
 *  输入用 tests/fixtures/upstream-app.js 快照——CI 里没有 ../token-fbi，且快照身份必须钉死：
 *  指纹漂移说明 fixture 被有意换代（需同步改常量），无意改动即红线失败。
 *  meta.json 含 lastSyncedAt 时间戳，天然不可复现，故意排除。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSeed } from "./export-seed.mjs";

const FIXTURE_SHA16 = "7f8c5cb80c9138c4";
const src = readFileSync(path.resolve(process.cwd(), "tests/fixtures/upstream-app.js"), "utf8");
const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), "config/site-config.json"), "utf8"));

const fix = createHash("sha256").update(src).digest("hex").slice(0, 16);
if (fix !== FIXTURE_SHA16) {
  console.error(`fixture 快照漂移：${fix}（期望 ${FIXTURE_SHA16}）——确认是否有意换代`);
  process.exit(1);
}

const sha = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 12);
const a = buildSeed(src, cfg);
const b = buildSeed(src, cfg);
for (const k of ["cards", "donots", "rules"]) {
  if (sha(a[k]) !== sha(b[k])) {
    console.error(`复现失败：${k} 两次输出不一致（${sha(a[k])} vs ${sha(b[k])}）`);
    process.exit(1);
  }
}
console.log(`seed 复现 OK：cards=${sha(a.cards)} donots=${sha(a.donots)} rules=${sha(a.rules)}`);

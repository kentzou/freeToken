/** 种子可复现红线（终审 #3 + 计划 2.5 幂等/陈旧扩展）。三道闸：
 *  a) 同输入连跑两次一致（确定性）；
 *  b) 把上一轮输出当作观点基底再跑一次仍一致（幂等）——这是 Q1 分层合并的地基：
 *     factPatch 键序固定，「产物喂回自己」必须逐字节不变，否则爬虫每轮都会把整站判成全量变更；
 *  c) 本轮输出必须与磁盘 data/*.json 一致（陈旧红线）——改了管线却忘了 npm run seed 时，
 *     测试与构建会各拿一份数据蒙混过关，这里一次性拦下。
 *  meta.json 含 lastSyncedAt 时间戳，天然不可复现，故意排除。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSeed, loadLocal } from "./export-seed.mjs";

const FIXTURE = "tests/fixtures/upstream-data.json";
const FIXTURE_SHA16 = "0276a024c4f6e10e";
const DISK = { cards: "tokens.json", donots: "donots.json", rules: "rules.json" };

const src = readFileSync(path.resolve(process.cwd(), FIXTURE), "utf8");
const cfg = JSON.parse(readFileSync(path.resolve(process.cwd(), "config/site-config.json"), "utf8"));

const fix = createHash("sha256").update(src).digest("hex").slice(0, 16);
if (fix !== FIXTURE_SHA16) {
  console.error(`fixture 快照漂移：${fix}（期望 ${FIXTURE_SHA16}）——确认是否有意换代`);
  process.exit(1);
}

const sha = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 12);
const local = loadLocal();
const a = buildSeed(src, cfg, local);
const b = buildSeed(src, cfg, local);
const c = buildSeed(src, cfg, { cards: a.cards, donots: a.donots, rules: a.rules });
for (const k of ["cards", "donots", "rules"]) {
  if (sha(a[k]) !== sha(b[k])) {
    console.error(`复现失败：${k} 两次输出不一致（${sha(a[k])} vs ${sha(b[k])}）`);
    process.exit(1);
  }
  if (sha(a[k]) !== sha(c[k])) {
    console.error(`幂等失败：${k} 喂回上一轮输出后发生变化（${sha(a[k])} vs ${sha(c[k])}）——factPatch 键序被破坏`);
    process.exit(1);
  }
  const disk = JSON.parse(readFileSync(path.resolve(process.cwd(), "data", DISK[k]), "utf8"));
  if (sha(a[k]) !== sha(disk)) {
    console.error(`陈旧红线：data/${DISK[k]} 与管线输出不一致（${sha(a[k])} vs ${sha(disk)}）→ 跑 npm run seed 后一并提交`);
    process.exit(1);
  }
}
console.log(`seed 复现 OK：cards=${sha(a.cards)} donots=${sha(a.donots)} rules=${sha(a.rules)}`);

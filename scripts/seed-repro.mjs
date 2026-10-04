/** 种子可复现红线（终审 #3 + 计划 2.5 幂等扩展）。保留两道闸：
 *  a) 同输入连跑两次一致（确定性）；
 *  b) 把上一轮输出当作观点基底再跑一次仍一致（幂等）——这是 Q1 分层合并的地基：
 *     factPatch 键序固定，「产物喂回自己」必须逐字节不变，否则爬虫每轮都会把整站判成全量变更；
 *
 *  为什么只剩两道：原第三道闸是「本轮输出必须与磁盘 data/*.json 一致」（陈旧红线），
 *  它在有常驻 crawler 的仓库里**数学上不可能成立**——它拿 buildSeed(冻结 fixture) 的输出
 *  去比磁盘，而 .github/workflows/crawl.yml 每 6 小时就把更新的上游数据写进 data/ 并提交。
 *  两者按设计就会持续分叉：磁盘比冻结 fixture 新是**正常状态**（实测磁盘 37 张卡、管线 33 张，
 *  多出的 4 张经逐张核对确实不在 fixture 的 items/retired 里，属真实上游新增）。
 *  它当初想抓的「改了管线却忘了跑 seed」，在这个仓库里已由别的机制负责：fixture 自身漂移由下方
 *  FIXTURE_SHA16 校验拦，数据新鲜度由 data/meta.json 的 lastSyncedAt / lastSyncedSha
 *  与爬虫自身的提交记录追溯。留着一道必然红的闸只会让 quality job 长红，把真故障淹没。
 *
 *  a) b) 之所以仍然有效：它们测的是**管线自身的行为**（同输入同输出、产物喂回自己不变），
 *  与磁盘当前处于什么状态无关——磁盘被 crawler 改过多少轮，这两条都不会因此变红或变绿。
 *  meta.json 含 lastSyncedAt 时间戳，天然不可复现，故意排除。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSeed, loadLocal } from "./export-seed.mjs";

const FIXTURE = "tests/fixtures/upstream-data.json";
const FIXTURE_SHA16 = "0276a024c4f6e10e";

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
}
console.log(`seed 复现 OK：cards=${sha(a.cards)} donots=${sha(a.donots)} rules=${sha(a.rules)}`);

/** 把镜像的品牌 logo 复制进本站 public。原作者海报不入包：它位于仓库根目录
 *  `token-fbi/poster-doubao-laxin.jpg`，不在 assets/logos 里；唯一引用它的「豆包拉新项目」
 *  已被 cleanCard 删掉非 http 的 poster 字段并被本站配置隐藏，seed 测试再兜一道。 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "..", "token-fbi", "assets", "logos");
const DEST = path.resolve(process.cwd(), "public", "assets", "logos");

mkdirSync(DEST, { recursive: true });
let n = 0;
for (const name of readdirSync(SRC)) {
  const from = path.join(SRC, name);
  if (!statSync(from).isFile()) continue;
  copyFileSync(from, path.join(DEST, name));
  n++;
}
if (!existsSync(path.join(DEST, "tencent.png"))) throw new Error("缺少兜底 logo tencent.png");
console.log(`assets 完成：${n} 个 logo`);

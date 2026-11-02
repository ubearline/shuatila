/**
 * 合并题库分卷 → data/kaogong.db
 * db/kaogong.db.part-00..NN（git 提交，各 <100MB 以适配 GitHub 单文件上限）
 * 合并后写入 data/kaogong.db（运行时只读，不入库）。
 * 纯二进制拼接，秒级完成 —— 不是重头解析题库。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, "db");
const outDir = path.join(root, "data");
const outFile = path.join(outDir, "kaogong.db");

const parts = fs
  .readdirSync(partsDir)
  .filter((f) => f.startsWith("kaogong.db.part-"))
  .sort();

if (!parts.length) {
  console.error("[ERR] 未在 db/ 找到分卷 kaogong.db.part-*");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const ws = fs.createWriteStream(outFile);
const BUFSIZE = 8 * 1024 * 1024;
for (const p of parts) {
  const src = path.join(partsDir, p);
  const data = fs.readFileSync(src);
  ws.write(data);
}
await new Promise((res, rej) => ws.end((e) => (e ? rej(e) : res())));
const sizeMB = (fs.statSync(outFile).size / 1048576).toFixed(1);
console.log(`[OK] 已合并 ${parts.length} 个分卷 → ${outFile}（${sizeMB} MB）`);

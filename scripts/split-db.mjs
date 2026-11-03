#!/usr/bin/env node
/**
 * 切分题库库 → db/kaogong.db.part-NN（入库，单卷 < 100MB 以适配 GitHub 单文件上限）
 *
 * 与 assemble-db.mjs 互为逆操作：assemble 做纯字节拼接，split 做纯字节切片，
 * 两者都不解析题库，秒级完成。
 *
 * 用法：
 *   node scripts/split-db.mjs                    # data/kaogong.db → db/（默认 30MiB/卷）
 *   KG_PART_MB=40 node scripts/split-db.mjs      # 自定义分卷大小
 *   node scripts/split-db.mjs --check            # 只校验现有分卷与库是否一致
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcFile = path.join(root, "data", "kaogong.db");
const partsDir = path.join(root, "db");
const PART_SIZE = Math.max(1, Number(process.env.KG_PART_MB || 30)) * 1024 * 1024;
const checkOnly = process.argv.includes("--check");

if (!fs.existsSync(srcFile)) {
  console.error(`[ERR] 找不到题库库：${srcFile}（先跑 pnpm db:assemble 或 pnpm db:import）`);
  process.exit(1);
}

const srcSize = fs.statSync(srcFile).size;
const oldParts = fs.existsSync(partsDir)
  ? fs.readdirSync(partsDir).filter((f) => f.startsWith("kaogong.db.part-")).sort()
  : [];
const oldTotal = oldParts.reduce((n, f) => n + fs.statSync(path.join(partsDir, f)).size, 0);

if (checkOnly) {
  if (oldTotal !== srcSize) {
    console.error(`[FAIL] 分卷合计 ${oldTotal} 字节 ≠ 题库库 ${srcSize} 字节，需重跑 node scripts/split-db.mjs`);
    process.exit(1);
  }
  console.log(`[OK] ${oldParts.length} 个分卷与题库库一致（${(srcSize / 1048576).toFixed(1)} MB）`);
  process.exit(0);
}

fs.mkdirSync(partsDir, { recursive: true });
// 先清掉旧分卷，避免新库变小后残留尾部脏分卷
for (const f of oldParts) fs.rmSync(path.join(partsDir, f), { force: true });

const buf = fs.readFileSync(srcFile);
const count = Math.ceil(buf.length / PART_SIZE) || 1;
for (let i = 0; i < count; i++) {
  const name = `kaogong.db.part-${String(i).padStart(2, "0")}`;
  const slice = buf.subarray(i * PART_SIZE, Math.min((i + 1) * PART_SIZE, buf.length));
  fs.writeFileSync(path.join(partsDir, name), slice);
}

// 回读校验：拼接结果必须与源库逐字节一致
const parts = fs.readdirSync(partsDir).filter((f) => f.startsWith("kaogong.db.part-")).sort();
let total = 0;
for (const p of parts) total += fs.statSync(path.join(partsDir, p)).size;
if (total !== srcSize) {
  console.error(`[FAIL] 分卷合计 ${total} 字节 ≠ 题库库 ${srcSize} 字节`);
  process.exit(1);
}
console.log(`[OK] 已切分 ${parts.length} 个分卷 → db/（${(srcSize / 1048576).toFixed(1)} MB，单卷 ≤ ${PART_SIZE / 1048576} MB）`);

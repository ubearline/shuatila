#!/usr/bin/env node
/**
 * 校验构建资产：题库分卷（db/kaogong.db.part-*）、合并库（data/kaogong.db）、题库图片（data/images）。
 *
 * 目的：把"镜像里没有图片"这类问题挡在构建期 —— 资产缺失直接非零退出，让构建失败，
 * 而不是产出一个能跑但全是破图的镜像。
 *
 * 用法：
 *   node scripts/verify-assets.mjs                 # 常规校验（图片少于 1000 张即失败）
 *   node scripts/verify-assets.mjs --min-images 1000
 *   node scripts/verify-assets.mjs --no-images     # 跳过图片校验（例如纯 CI 单元测试）
 *   node scripts/verify-assets.mjs --quiet
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const quiet = has("--quiet");
const skipImages = has("--no-images");
const minImages = Number(opt("--min-images", 1000));

const partsDir = path.join(root, "db");
const dbFile = path.join(root, "data", "kaogong.db");
const imagesDir = path.join(root, "data", "images");

const errors = [];
const log = (...a) => {
  if (!quiet) console.log(...a);
};
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

// ---------- 1. 题库分卷 ----------
let partTotal = 0;
let partCount = 0;
if (!fs.existsSync(partsDir)) {
  errors.push(`缺少分卷目录：${partsDir}`);
} else {
  const parts = fs
    .readdirSync(partsDir)
    .filter((f) => f.startsWith("kaogong.db.part-"))
    .sort();
  partCount = parts.length;
  for (const p of parts) partTotal += fs.statSync(path.join(partsDir, p)).size;
  if (!parts.length) errors.push(`db/ 下没有分卷 kaogong.db.part-*`);
  log(`[分卷] ${partCount} 个，合计 ${mb(partTotal)}`);
}

// ---------- 2. 合并后的题库库（存在才校验，不存在由 assemble-db 生成） ----------
let questionCount = null;
if (fs.existsSync(dbFile)) {
  const size = fs.statSync(dbFile).size;
  if (partCount && size !== partTotal) {
    errors.push(`data/kaogong.db（${size} 字节）与分卷合计（${partTotal} 字节）不一致，请重跑 pnpm db:assemble`);
  }
  log(`[题库] ${path.relative(root, dbFile)} ${mb(size)}`);
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    questionCount = db.prepare("SELECT COUNT(*) n FROM questions").get().n;
    db.close();
    log(`[题库] questions = ${questionCount}`);
    if (!questionCount) errors.push("题库 questions 表为空");
  } catch (e) {
    log(`[题库] 跳过题数统计（better-sqlite3 不可用：${e.message}）`);
  }
} else {
  log("[题库] data/kaogong.db 尚未生成（构建期由 assemble-db.mjs 生成）");
}

// ---------- 3. 图片 ----------
let imageCount = 0;
let imageBytes = 0;
if (!skipImages) {
  if (!fs.existsSync(imagesDir)) {
    errors.push(`缺少图片目录：${path.relative(root, imagesDir)}（应由 pnpm db:images 生成并入库）`);
  } else {
    const exts = new Set([".webp", ".gif", ".png", ".jpg", ".jpeg"]);
    for (const entry of fs.readdirSync(imagesDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!exts.has(path.extname(entry.name).toLowerCase())) continue;
      imageCount += 1;
      try {
        imageBytes += fs.statSync(path.join(entry.parentPath ?? entry.path, entry.name)).size;
      } catch {
        /* 统计体积失败不影响校验 */
      }
    }
    log(`[图片] ${imageCount} 张，合计 ${mb(imageBytes)}`);
    if (imageCount < minImages) {
      errors.push(`图片数量 ${imageCount} 少于阈值 ${minImages}（检查 data/images 是否随仓库提交、是否被 .dockerignore 排除）`);
    }
  }
} else {
  log("[图片] 已跳过校验（--no-images）");
}

// ---------- 结果 ----------
if (errors.length) {
  console.error("\n[FAIL] 资产校验未通过：");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
log("[OK] 资产校验通过");

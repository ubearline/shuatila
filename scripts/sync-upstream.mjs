#!/usr/bin/env node
/**
 * 上游同步管线（手动触发）—— 从上游题库仓库拉取「图片 + 题库分卷」，落进本项目并提交。
 *
 * 设计原则：镜像只基于本仓库内容构建，不依赖任何上游。
 * 上游更新不会自动进镜像，必须显式跑一次本脚本，把资产
 *   - 图片  → data/images/（已入库）
 *   - 分卷  → db/kaogong.db.part-NN（已入库）
 * 更新到本仓库并提交，之后重建镜像即可。
 *
 * 流程：
 *   1) （可选）git pull 上游仓库                 --pull
 *   2) 图片同步   <上游>/90-图片 → data/images   增量复制（同名同大小跳过）
 *   3) 分卷同步   <上游>/kaogong.db.part-* → db/ 替换旧分卷，并重新拼 data/kaogong.db
 *   4) 校验       scripts/verify-assets.mjs     字节一致 + 题数 + 图片张数
 *   5) （可选）git add + commit                  --commit
 *
 * 用法：
 *   node scripts/sync-upstream.mjs                      # 同步 + 校验，不提交
 *   node scripts/sync-upstream.mjs --pull --commit      # 先更新上游再同步并提交
 *   node scripts/sync-upstream.mjs --no-images          # 只更新题库分卷
 *   node scripts/sync-upstream.mjs --no-db              # 只更新图片
 *   node scripts/sync-upstream.mjs --encode             # 图片用 img2webp.py 重新转码（源非 WebP 时用）
 *   node scripts/sync-upstream.mjs --reparse            # 额外跑 parse.py 重解析 markdown 源（需 10-真题）
 *   node scripts/sync-upstream.mjs --vault <上游路径> [--parts-dir <路径>] [--images-dir <路径>]
 *   node scripts/sync-upstream.mjs --dry-run            # 只看计划，不写文件
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

const doPull = has("--pull");
const doImages = !has("--no-images");
const doDb = !has("--no-db");
const encode = has("--encode");
const reparse = has("--reparse");
const doCommit = has("--commit");
const dryRun = has("--dry-run");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const IMG_EXTS = new Set([".webp", ".gif", ".png", ".jpg", ".jpeg"]);

const step = (t) => console.log(`\n=== ${t} ===`);
const fail = (msg) => {
  console.error(`\n[FAIL] ${msg}`);
  process.exit(1);
};
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

function run(cmd, args, extraEnv = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (r.error) fail(`${cmd} 启动失败：${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} 退出码 ${r.status}`);
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && IMG_EXTS.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

// ---------- 0. 定位上游 ----------
function looksLikeVault(dir) {
  try {
    return (
      fs.existsSync(path.join(dir, "90-图片")) ||
      fs.existsSync(path.join(dir, "kaogong.db.part-00")) ||
      fs.existsSync(path.join(dir, "10-真题")) ||
      fs.existsSync(path.join(dir, "db", "kaogong.db.part-00"))
    );
  } catch {
    return false;
  }
}

function discoverVault() {
  const parent = path.dirname(root);
  const candidates = [path.join(parent, "kaogongzhentizhengliu-main")];
  // 父目录下两层内扫描含 90-图片 / 分卷 / 10-真题 的目录
  for (const a of fs.readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const p1 = path.join(parent, a.name);
    candidates.push(p1);
    try {
      for (const b of fs.readdirSync(p1, { withFileTypes: true }).filter((d) => d.isDirectory())) {
        candidates.push(path.join(p1, b.name));
      }
    } catch {
      /* 无权限等忽略 */
    }
  }
  return candidates.find(looksLikeVault) || null;
}

const explicitVault = opt("--vault", process.env.KAOGONG_VAULT || "");
let vault = explicitVault ? path.resolve(explicitVault) : discoverVault();
if (!vault) {
  fail("未能定位上游仓库，请用 --vault <路径> 或环境变量 KAOGONG_VAULT 指定（需含 90-图片 或 kaogong.db.part-*）");
}
if (!fs.existsSync(vault)) fail(`找不到上游仓库：${vault}`);
console.log(`[上游] ${vault}`);
console.log(`[项目] ${root}${dryRun ? "（--dry-run，不写文件）" : ""}`);

// ---------- 1. 可选：拉取上游 ----------
step("1/5 拉取上游仓库");
if (!doPull) {
  console.log("[SKIP] 未指定 --pull，使用本地上游当前内容");
} else if (!fs.existsSync(path.join(vault, ".git"))) {
  console.log("[SKIP] 上游不是 git 仓库（无 .git），跳过 pull");
} else {
  const r = spawnSync("git", ["-C", vault, "pull", "--ff-only"], { stdio: "inherit" });
  if (r.status !== 0) fail("git pull 失败（可能上游本地有改动或非快进），请手动处理后重试");
}

// ---------- 2. 图片 ----------
step("2/5 图片 → data/images");
const imagesDir = path.join(root, "data", "images");
if (!doImages) {
  console.log("[SKIP] --no-images");
} else if (encode) {
  // 源图非 WebP（png/jpg/gif）时用 Pillow 转码
  if (dryRun) console.log("[DRY] 将运行 img2webp.py");
  else run(python, [path.join(root, "scripts", "img2webp.py")], { KAOGONG_VAULT: vault });
} else {
  const src = path.resolve(opt("--images-dir", path.join(vault, "90-图片")));
  if (!fs.existsSync(src)) fail(`上游图片目录不存在：${src}（可用 --images-dir 指定）`);
  const files = walk(src);
  let added = 0;
  let skipped = 0;
  let bytes = 0;
  for (const f of files) {
    const rel = path.relative(src, f);
    const dst = path.join(imagesDir, rel);
    if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(f).size) {
      skipped += 1;
      continue;
    }
    added += 1;
    bytes += fs.statSync(f).size;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(f, dst);
    }
  }
  console.log(`[图片] 源 ${files.length} 张；新增/更新 ${added} 张${added ? `（${mb(bytes)}）` : ""}，跳过 ${skipped} 张`);
}

// ---------- 3. 题库分卷 ----------
step("3/5 分卷 → db/kaogong.db.part-NN");
const partsDir = path.join(root, "db");
if (!doDb) {
  console.log("[SKIP] --no-db");
} else if (reparse) {
  if (dryRun) console.log("[DRY] 将运行 parse.py 与 split-db.mjs");
  else {
    run(python, [path.join(root, "scripts", "parse.py")], { KAOGONG_VAULT: vault });
    run(process.execPath, [path.join(root, "scripts", "split-db.mjs")]);
  }
} else {
  let srcDir = opt("--parts-dir", "");
  if (srcDir) srcDir = path.resolve(srcDir);
  else if (fs.existsSync(path.join(vault, "db", "kaogong.db.part-00"))) srcDir = path.join(vault, "db");
  else srcDir = vault;

  const parts = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter((f) => f.startsWith("kaogong.db.part-")).sort()
    : [];
  if (parts.length) {
    console.log(`[分卷] 源 ${srcDir}（${parts.length} 个）`);
    if (!dryRun) {
      const old = fs
        .readdirSync(partsDir)
        .filter((f) => f.startsWith("kaogong.db.part-"))
        .map((f) => path.join(partsDir, f));
      for (const f of old) fs.rmSync(f, { force: true });
      for (const p of parts) fs.copyFileSync(path.join(srcDir, p), path.join(partsDir, p));
    }
    console.log(`[分卷] 已同步 ${parts.length} 个 → db/`);
  } else if (fs.existsSync(path.join(srcDir, "kaogong.db"))) {
    // 上游给的是整库：拷进来后切分
    console.log(`[分卷] 上游为整库，拷贝到 data/kaogong.db 后切分`);
    if (!dryRun) {
      fs.copyFileSync(path.join(srcDir, "kaogong.db"), path.join(root, "data", "kaogong.db"));
      run(process.execPath, [path.join(root, "scripts", "split-db.mjs")]);
    }
  } else {
    fail(`上游既没有 kaogong.db.part-* 也没有 kaogong.db：${srcDir}（可用 --parts-dir 指定）`);
  }

  // 重新拼本地运行时库，保证 data/kaogong.db 与新分卷一致
  if (!dryRun) run(process.execPath, [path.join(root, "scripts", "assemble-db.mjs")]);
}

// ---------- 4. 校验 ----------
step("4/5 校验资产");
if (dryRun) console.log("[DRY] 将运行 verify-assets.mjs");
else run(process.execPath, [path.join(root, "scripts", "verify-assets.mjs")]);

// ---------- 5. 入库 ----------
step("5/5 入库");
const changes = [];
if (doImages) changes.push("data/images");
if (doDb) changes.push("db");
if (!doCommit) {
  console.log("未指定 --commit。确认无误后手动提交：");
  console.log(`  git add ${changes.join(" ")} && git commit -m "chore(data): 同步上游题库与图片"`);
} else if (dryRun) {
  console.log("[DRY] 将提交：" + changes.join(" "));
} else {
  run("git", ["add", "--", ...changes]);
  const stamp = new Date().toISOString().slice(0, 10);
  const r = spawnSync("git", ["commit", "-m", `chore(data): 同步上游题库与图片 ${stamp}`], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) console.log("[WARN] git commit 未成功（可能没有变更），请检查 git status");
}

console.log("\n[DONE] 资产已就绪。重建镜像：docker compose up -d --build");

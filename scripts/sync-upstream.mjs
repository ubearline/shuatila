#!/usr/bin/env node
/**
 * 上游同步管线（手动触发）—— 从上游题库仓库拉取「图片 + 题库」，落到本项目并入库。
 *
 * 设计原则：镜像只基于本仓库内容构建，不依赖任何上游。
 * 因此上游更新不会自动进镜像，必须显式跑一次本脚本，把资产（data/images、db/kaogong.db.part-*）
 * 更新到本仓库，提交后再构建镜像。
 *
 * 流程：
 *   1) （可选）git pull 上游仓库            --pull
 *   2) 解析真题 → data/kaogong.db          scripts/parse.py（--fresh 时全量重建）
 *   3) 原图转 WebP → data/images           scripts/img2webp.py（增量，已存在则跳过）
 *   4) 切分题库 → db/kaogong.db.part-NN    scripts/split-db.mjs
 *   5) 校验资产                            scripts/verify-assets.mjs
 *   6) （可选）git add + commit            --commit
 *
 * 用法：
 *   node scripts/sync-upstream.mjs                  # 同步 + 校验，不提交
 *   node scripts/sync-upstream.mjs --pull           # 先更新上游仓库再同步
 *   node scripts/sync-upstream.mjs --pull --fresh --commit
 *   node scripts/sync-upstream.mjs --no-images      # 只更新题库，不动图片
 *   node scripts/sync-upstream.mjs --vault "D:/kaogong/kaogongzhentizhengliu-main"
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

const vault = path.resolve(
  opt("--vault", process.env.KAOGONG_VAULT || path.join(root, "..", "kaogongzhentizhengliu-main"))
);
const doPull = has("--pull");
const fresh = has("--fresh");
const noImages = has("--no-images");
const doCommit = has("--commit");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const step = (title) => console.log(`\n=== ${title} ===`);
const fail = (msg) => {
  console.error(`\n[FAIL] ${msg}`);
  process.exit(1);
};

function run(cmd, args, extraEnv = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd),
  });
  if (r.error) fail(`${cmd} 启动失败：${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} 退出码 ${r.status}`);
}

// ---------- 0. 环境检查 ----------
if (!fs.existsSync(vault)) {
  fail(
    `找不到上游题库仓库：${vault}\n` +
      `  用 --vault <路径> 或环境变量 KAOGONG_VAULT 指定（应包含 10-真题 / 15-材料 / 90-图片）`
  );
}
console.log(`[上游] ${vault}`);
console.log(`[项目] ${root}`);

// ---------- 1. 可选：拉取上游 ----------
if (doPull) {
  step("1/6 拉取上游仓库");
  if (!fs.existsSync(path.join(vault, ".git"))) {
    console.log("[SKIP] 上游不是 git 仓库，跳过 git pull");
  } else {
    const r = spawnSync("git", ["-C", vault, "pull", "--ff-only"], { stdio: "inherit" });
    if (r.status !== 0) fail("git pull 失败（可能本地有改动或非快进），请手动处理后重试");
  }
} else {
  step("1/6 拉取上游仓库");
  console.log("[SKIP] 未指定 --pull，使用当前本地上游内容");
}

// ---------- 2. 解析题库 ----------
step(`2/6 解析真题 → data/kaogong.db${fresh ? "（全量重建）" : "（增量）"}`);
run(python, [path.join(root, "scripts", "parse.py"), ...(fresh ? ["--fresh"] : [])], {
  KAOGONG_VAULT: vault,
});

// ---------- 3. 图片转 WebP ----------
step("3/6 原图 → data/images（WebP，增量）");
if (noImages) {
  console.log("[SKIP] --no-images，保留现有图片");
} else {
  run(python, [path.join(root, "scripts", "img2webp.py")], { KAOGONG_VAULT: vault });
}

// ---------- 4. 切分分卷 ----------
step("4/6 切分 → db/kaogong.db.part-NN");
run(process.execPath, [path.join(root, "scripts", "split-db.mjs")]);

// ---------- 5. 校验 ----------
step("5/6 校验资产");
run(process.execPath, [path.join(root, "scripts", "verify-assets.mjs")]);

// ---------- 6. 提交 ----------
step("6/6 入库");
if (!doCommit) {
  console.log("未指定 --commit。确认无误后手动提交：");
  console.log("  git add data/images db && git commit -m \"chore(data): 同步上游题库与图片\"");
} else {
  const stamp = new Date().toISOString().slice(0, 10);
  run("git", ["add", "--", "data/images", "db"]);
  const r = spawnSync("git", ["commit", "-m", `chore(data): 同步上游题库与图片 ${stamp}`], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) console.log("[WARN] git commit 未成功（可能没有变更），请检查 git status");
}

console.log("\n[DONE] 资产已就绪。重新构建镜像：docker compose up -d --build");

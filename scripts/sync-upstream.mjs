#!/usr/bin/env node
/**
 * 上游同步管线（手动触发）—— 从「原始题库 Vault」拉取 markdown 真题与原图，重建本项目资产并提交。
 *
 * 数据源关系：
 *   ERRRC/xingcezhenti（原始 Obsidian 题库：10-真题 / 15-材料 / 90-图片 原图）
 *        │  解析 + 转码
 *        ▼
 *   本项目 ShuaTiLa：data/kaogong.db（由 db 分卷拼出）+ data/images（WebP）
 *        │  构建期
 *        ▼
 *   Docker 镜像（只基于本仓库，不依赖任何外部仓库）
 *
 *   ※ GongkaoNaoku 是实现逻辑上的参考项目，不是本项目的数据上游，本管线不读它。
 *
 * 流程：
 *   1) 获取上游   git clone/pull xingcezhenti 到 .cache/upstream（或用 --vault 指定已有副本 / --zip 指定快照）
 *   2) 解析真题   scripts/parse.py        markdown → data/kaogong.db（增量；--fresh 全量重建）
 *   3) 图片转码   scripts/img2webp.py     <vault>/90-图片 → data/images（WebP q88，已存在跳过）
 *   4) 切分卷     scripts/split-db.mjs    data/kaogong.db → db/kaogong.db.part-NN
 *   5) 校验       scripts/verify-assets.mjs
 *   6) 入库       git add + commit（--commit）
 *
 * 用法：
 *   pnpm sync:upstream                        # 用已有/缓存的上游副本同步（不更新上游、不提交）
 *   pnpm sync:upstream --pull --commit        # 更新上游 → 解析 → 转图 → 切分 → 校验 → 提交
 *   pnpm sync:upstream --fresh                # 题库全量重建（清空旧题重解析）
 *   pnpm sync:upstream --no-images            # 只更新题库，不转图
 *   pnpm sync:upstream --no-db                # 只转图，不动题库
 *   pnpm sync:upstream --vault <vault路径>    # 用本地已有的原始题库副本
 *   pnpm sync:upstream --repo <git地址>       # 换上游仓库地址（或环境变量 KAOGONG_UPSTREAM_REPO）
 *   pnpm sync:upstream --zip <zip路径或URL>   # 用仓库快照 zip（git 不通时用）
 *   pnpm sync:upstream --dry-run              # 只看计划，不写文件
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
const fresh = has("--fresh");
const doCommit = has("--commit");
const dryRun = has("--dry-run");
const zipArg = opt("--zip", "");
const repo = opt("--repo", process.env.KAOGONG_UPSTREAM_REPO || "https://github.com/ERRRC/xingcezhenti.git");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const CACHE_DIR = path.join(root, ".cache", "upstream");
const DEFAULT_VAULT = path.join(CACHE_DIR, "xingcezhenti");

const step = (t) => console.log(`\n=== ${t} ===`);
const fail = (msg) => {
  console.error(`\n[FAIL] ${msg}`);
  process.exit(1);
};

function run(cmd, args, extraEnv = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (r.error) fail(`${cmd} 启动失败：${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} 退出码 ${r.status}`);
}

function git(args, cwd) {
  return spawnSync("git", args, { cwd, stdio: "inherit" }).status === 0;
}

function findVaultRoot(dir) {
  // zip 解压后可能多一层 xingcezhenti-main/
  if (fs.existsSync(path.join(dir, "10-真题")) || fs.existsSync(path.join(dir, "90-图片"))) return dir;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (fs.existsSync(path.join(p, "10-真题")) || fs.existsSync(path.join(p, "90-图片"))) return p;
  }
  return null;
}

function unzip(zipPath, dest) {
  fs.mkdirSync(dest, { recursive: true });
  console.log(`[zip] 解压 ${zipPath} → ${dest}`);
  const ok =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${dest}'`],
          { stdio: "inherit" }
        ).status === 0
      : spawnSync("unzip", ["-q", "-o", zipPath, "-d", dest], { stdio: "inherit" }).status === 0;
  if (!ok) fail(`解压失败：${zipPath}（Windows 需 PowerShell，其他平台需 unzip）`);
  return findVaultRoot(dest);
}

// ---------- 0. 依赖预检 ----------
if (spawnSync(python, ["-c", "import sys"], { stdio: "ignore" }).status !== 0) {
  fail(`找不到 Python 解释器（${python}）。可用 PYTHON=<路径> 指定。`);
}
if (doImages && spawnSync(python, ["-c", "import PIL"], { stdio: "ignore" }).status !== 0) {
  fail(`图片转码需要 Pillow：${python} -m pip install Pillow`);
}

// ---------- 1. 获取上游 ----------
step("1/6 获取上游原始题库（xingcezhenti）");
let vault = opt("--vault", process.env.KAOGONG_VAULT || "");
if (vault) vault = path.resolve(vault);
else if (fs.existsSync(DEFAULT_VAULT)) vault = DEFAULT_VAULT;

if (zipArg) {
  let zipPath = zipArg;
  if (/^https?:\/\//i.test(zipArg)) {
    zipPath = path.join(CACHE_DIR, "xingcezhenti.zip");
    if (!fs.existsSync(zipPath) || doPull) {
      if (dryRun) {
        console.log(`[DRY] 下载 ${zipArg}`);
      } else {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`[下载] ${zipArg} → ${zipPath}`);
        const res = await fetch(zipArg);
        if (!res.ok) fail(`下载失败：HTTP ${res.status}`);
        fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
      }
    }
  }
  if (!fs.existsSync(zipPath)) fail(`zip 不存在：${zipPath}`);
  const found = dryRun ? DEFAULT_VAULT : unzip(zipPath, path.join(CACHE_DIR, "snapshot"));
  vault = found || vault || DEFAULT_VAULT;
} else if (vault && fs.existsSync(vault)) {
  if (!doPull) {
    console.log("[SKIP] 未指定 --pull，使用副本当前内容");
  } else if (fs.existsSync(path.join(vault, ".git"))) {
    console.log(`[更新] git pull --ff-only：${vault}`);
    if (!dryRun && !git(["pull", "--ff-only"], vault)) fail("git pull 失败（副本有本地改动或非快进），请手动处理");
  } else {
    console.log("[SKIP] 该副本不是 git 仓库，跳过更新");
  }
} else {
  if (dryRun) {
    console.log(`[DRY] 将 git clone --depth 1 ${repo} → ${DEFAULT_VAULT}`);
    vault = DEFAULT_VAULT;
  } else {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`[克隆] ${repo} → ${DEFAULT_VAULT}（浅克隆，含原图，可能要几分钟）`);
    if (!git(["clone", "--depth", "1", repo, DEFAULT_VAULT], root)) {
      fail(
        `浅克隆失败。可换地址：--repo <地址> 或 KAOGONG_UPSTREAM_REPO=<地址>；\n` +
          `  或手动下载仓库 zip 后用 --zip <路径或URL>。`
      );
    }
    vault = DEFAULT_VAULT;
  }
}

if (!fs.existsSync(vault)) {
  if (dryRun) console.log(`[DRY] 上游副本尚未下载：${vault}`);
  else fail(`上游副本不存在：${vault}（用 --vault 指定，或不指定让它自动克隆）`);
}
const vaultRoot = (fs.existsSync(vault) ? findVaultRoot(vault) : null) || vault;
console.log(`[上游] ${vaultRoot}`);
console.log(`[项目] ${root}${dryRun ? "（--dry-run，不写文件）" : ""}`);
if (!dryRun) {
  if (doDb && !fs.existsSync(path.join(vaultRoot, "10-真题"))) {
    fail(`上游副本里没有 10-真题/：${vaultRoot}（原始题库 Vault 应含 10-真题 / 15-材料 / 90-图片）`);
  }
  if (doImages && !fs.existsSync(path.join(vaultRoot, "90-图片"))) {
    fail(`上游副本里没有 90-图片/：${vaultRoot}`);
  }
}

// ---------- 2. 解析题库 ----------
step(`2/6 解析真题 → data/kaogong.db${fresh ? "（全量重建）" : "（增量）"}`);
if (!doDb) {
  console.log("[SKIP] --no-db");
} else if (dryRun) {
  console.log("[DRY] 将运行 parse.py");
} else {
  run(python, [path.join(root, "scripts", "parse.py"), ...(fresh ? ["--fresh"] : [])], {
    KAOGONG_VAULT: vaultRoot,
  });
}

// ---------- 3. 图片转码 ----------
step("3/6 原图 90-图片 → data/images（WebP，增量）");
if (!doImages) {
  console.log("[SKIP] --no-images");
} else if (dryRun) {
  console.log("[DRY] 将运行 img2webp.py");
} else {
  run(python, [path.join(root, "scripts", "img2webp.py")], { KAOGONG_VAULT: vaultRoot });
}

// ---------- 4. 切分卷 ----------
step("4/6 切分 → db/kaogong.db.part-NN");
if (!doDb) {
  console.log("[SKIP] --no-db");
} else if (dryRun) {
  console.log("[DRY] 将运行 split-db.mjs");
} else {
  run(process.execPath, [path.join(root, "scripts", "split-db.mjs")]);
}

// ---------- 5. 校验 ----------
step("5/6 校验资产");
if (dryRun) console.log("[DRY] 将运行 verify-assets.mjs");
else run(process.execPath, [path.join(root, "scripts", "verify-assets.mjs")]);

// ---------- 6. 入库 ----------
step("6/6 入库");
const changes = [];
if (doDb) changes.push("db");
if (doImages) changes.push("data/images");
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

#!/usr/bin/env node
/**
 * 上游同步管线（手动触发）—— 拿到「原始题库 Vault」后解析真题、转码图片，重建本项目资产并提交。
 *
 * 数据血缘：
 *   ERRRC/xingcezhenti（公开原始真题，未蒸馏，顶层 01-…/06-… 模块目录 + 90-图片）
 *        │  蒸馏成 Obsidian Vault（一题一文件）
 *        ▼
 *   蒸馏后 Vault：10-真题/<模块>/<大类>/<题>.md + 15-材料/ + 90-图片/
 *        │  parse.py 解析 + img2webp.py 转码（本脚本）
 *        ▼
 *   本项目 ShuaTiLa：db/kaogong.db.part-NN + data/images（WebP），全部入库
 *        │  Docker 构建期
 *        ▼
 *   镜像（只基于本仓库，不依赖任何外部仓库）
 *
 *   ※ GongkaoNaoku 只是实现逻辑上的参考项目，不是数据上游，本管线不读它。
 *   ※ parse.py 只认「蒸馏后 Vault」结构（10-真题，一题一文件）。
 *     直接给 xingcezhenti 原始快照（01-…/06-…，一文件多题）它解析不了，会明确报错。
 *
 * 流程：
 *   1) 定位 Vault   --vault / KAOGONG_VAULT / 项目旁 ../kaogongzhentizhengliu-main /
 *                   .cache/upstream 下已有副本；也可用 --repo 克隆、--zip 用快照 zip
 *   2) 解析真题   scripts/parse.py        markdown → data/kaogong.db（增量；--fresh 全量重建）
 *   3) 图片转码   scripts/img2webp.py     <vault>/90-图片 → data/images（WebP q88，已存在跳过）
 *   4) 切分卷     scripts/split-db.mjs    data/kaogong.db → db/kaogong.db.part-NN
 *   5) 校验       scripts/verify-assets.mjs
 *   6) 入库       git add + commit（--commit）
 *
 * 用法：
 *   pnpm sync:upstream --vault D:/vault/kaogongzhentizhengliu-main --commit
 *   pnpm sync:upstream --vault <vault> --pull --commit   # Vault 是 git 仓库时先更新再同步
 *   pnpm sync:upstream --repo <git地址>                  # 没有本地副本时克隆（或 KAOGONG_UPSTREAM_REPO）
 *   pnpm sync:upstream --zip <zip路径或URL>              # 用仓库快照 zip
 *   pnpm sync:upstream --fresh                           # 题库全量重建（清空旧题重解析）
 *   pnpm sync:upstream --no-images / --no-db             # 只更新题库 / 只转图
 *   pnpm sync:upstream --dry-run                         # 只看计划，不写文件
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
const repo = opt("--repo", process.env.KAOGONG_UPSTREAM_REPO || "");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const CACHE_DIR = path.join(root, ".cache", "upstream");
const SIBLING_VAULT = path.join(path.dirname(root), "kaogongzhentizhengliu-main");

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
  // zip 解压后可能多一层顶层目录（xingcezhenti-main/、kaogongzhentizhengliu-main/ 等）
  if (fs.existsSync(path.join(dir, "10-真题")) || fs.existsSync(path.join(dir, "90-图片"))) return dir;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (fs.existsSync(path.join(p, "10-真题")) || fs.existsSync(path.join(p, "90-图片"))) return p;
  }
  return null;
}

// 自动定位「蒸馏后 Vault」：项目旁的 kaogongzhentizhengliu-main，或 .cache/upstream 下的任一副本
function discoverVault() {
  const cands = [SIBLING_VAULT];
  if (fs.existsSync(CACHE_DIR)) {
    for (const e of fs.readdirSync(CACHE_DIR, { withFileTypes: true })) {
      if (e.isDirectory()) cands.push(path.join(CACHE_DIR, e.name));
    }
  }
  for (const c of cands) {
    const found = fs.existsSync(c) ? findVaultRoot(c) : null;
    if (found) return found;
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

// ---------- 1. 定位/获取 Vault ----------
step("1/6 定位原始题库 Vault（10-真题 / 15-材料 / 90-图片）");
let vault = opt("--vault", process.env.KAOGONG_VAULT || "");
if (vault) vault = path.resolve(vault);
else vault = discoverVault() || "";

if (zipArg) {
  let zipPath = zipArg;
  if (/^https?:\/\//i.test(zipArg)) {
    zipPath = path.join(CACHE_DIR, "upstream.zip");
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
  const found = dryRun ? zipPath : unzip(zipPath, path.join(CACHE_DIR, "snapshot"));
  vault = found || vault;
} else if (vault && fs.existsSync(vault)) {
  if (!doPull) {
    console.log("[SKIP] 未指定 --pull，使用副本当前内容");
  } else if (fs.existsSync(path.join(vault, ".git"))) {
    console.log(`[更新] git pull --ff-only：${vault}`);
    if (!dryRun && !git(["pull", "--ff-only"], vault)) fail("git pull 失败（副本有本地改动或非快进），请手动处理");
  } else {
    console.log("[SKIP] 该副本不是 git 仓库，跳过更新");
  }
} else if (repo) {
  const dest = path.join(CACHE_DIR, repo.replace(/[\\/]+$/, "").split(/[\\/]/).pop().replace(/\.git$/, ""));
  if (dryRun) {
    console.log(`[DRY] 将 git clone --depth 1 ${repo} → ${dest}`);
    vault = dest;
  } else {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`[克隆] ${repo} → ${dest}（浅克隆，含原图，可能要几分钟）`);
    if (!git(["clone", "--depth", "1", repo, dest], root)) {
      fail(`浅克隆失败：${repo}。可换地址 --repo <地址>，或手动下载 zip 后用 --zip <路径或URL>。`);
    }
    vault = dest;
  }
} else {
  fail(
    "找不到原始题库 Vault。请用以下任一方式提供：\n" +
      `  1) --vault <路径>     本地 Vault（需含 10-真题 / 15-材料 / 90-图片），默认也会找 ${SIBLING_VAULT}\n` +
      "  2) --repo <git地址>   从 git 仓库浅克隆（或设环境变量 KAOGONG_UPSTREAM_REPO）\n" +
      "  3) --zip <zip或URL>   用仓库快照 zip（可给本地路径或下载链接）\n" +
      "  注意：需要的是「蒸馏后」的 Vault（一题一文件），不是 xingcezhenti 原始快照（一文件多题）。"
  );
}

if (!fs.existsSync(vault)) {
  if (dryRun) console.log(`[DRY] Vault 尚未下载：${vault}`);
  else fail(`Vault 不存在：${vault}`);
}
const vaultRoot = (fs.existsSync(vault) ? findVaultRoot(vault) : null) || vault;
console.log(`[Vault] ${vaultRoot}`);
console.log(`[项目] ${root}${dryRun ? "（--dry-run，不写文件）" : ""}`);
if (!dryRun) {
  if (doDb && !fs.existsSync(path.join(vaultRoot, "10-真题"))) {
    fail(
      `Vault 里没有 10-真题/：${vaultRoot}\n` +
        "  parse.py 需要「蒸馏后」的 Vault：10-真题/<模块>/<大类>/<题>.md + 15-材料 + 90-图片。\n" +
        "  若这是 xingcezhenti 原始快照（顶层 01-…/06-…、一文件多题），现有解析器无法直接解析。"
    );
  }
  if (doImages && !fs.existsSync(path.join(vaultRoot, "90-图片"))) {
    fail(`Vault 里没有 90-图片/：${vaultRoot}`);
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

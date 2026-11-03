# ShuaTiLa · 考公刷题系统

Next.js + better-sqlite3 实现的考公刷题平台（原「考公脑库」）。支持 SM-2 间隔重复、错题本、收藏、笔记、疑问、模拟考试、打卡统计、考点/资料/难点聚合，图片热力图与 WebP 题库图片内嵌展示。

## 数据架构（双库，不必迁移）

| 文件 | 作用 | 存放 |
|---|---|---|
| `kaogong.db` | 只读题库：27,506 题、58,890 真题出现记录、1,578 份材料 | 运行时 `data/`，由分卷 `db/kaogong.db.part-*` 拼接 |
| `users.db` | 用户数据：账号 / SRS 进度 / 评测记录 / 笔记 / 收藏 / 疑问 / 考试历史 / 设置 | `data/`，可 `USERS_DB_PATH` 覆盖，Docker 挂持久卷 |
| `data/images/` | 39,692 张 WebP 配图（题目图 + 公式图，87 MB） | **入库**，构建期打进镜像 |

> 资产策略：**镜像只基于本仓库构建，不依赖上游**。题库分卷（`db/`）与题库图片（`data/images/`）都提交在 git 里；
> 上游更新不会自动进镜像，需手动跑一次 `pnpm sync:upstream` 把资产同步进仓库并提交（见下节）。


跨库 JOIN 通过 SQLite `ATTACH DATABASE ... AS users` 实现（题库连接上把用户库附加为 `users`），路由 SQL 以 `users.srs` / `users.favorites` / `users.doubt_status` 前缀访问用户态。

## 本地启动（pnpm，秒级，不重头构建题库）

```bash
pnpm install            # 首次；node-linker=hoisted（见 .npmrc）
pnpm db:assemble        # 拼接 db/kaogong.db.part-* -> data/kaogong.db（秒级）
pnpm dev                # http://localhost:3000
```

> 题库分卷（5×~30MB）与题库图片（`data/images`，39,692 张）均已入库；`db:assemble` 只做字节拼接，
> **不重新解析题库**，所以本地启动和 CI 构建都很快。克隆仓库即有图，无需再跑 `db:images`。

## 数据来源

```
ERRRC/xingcezhenti（原始 Obsidian 题库：10-真题 / 15-材料 / 90-图片 原图）
   │  parse.py 解析 + img2webp.py 转码
   ▼
ShuaTiLa 本仓库：data/kaogong.db（由 db 分卷拼出）+ data/images（WebP）
   │  Docker 构建期
   ▼
镜像（只基于本仓库，不依赖任何外部仓库）
```

- **上游 = [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)**（2016–2026 行测真题，515 卷 / 58,890 题行 / 3.9 万张图），这是本项目唯一的数据上游。
- **GongkaoNaoku（考公脑库）只是实现逻辑上的参考项目**，不是数据上游 —— 同步管线不读它。
- 上游副本默认缓存在 `.cache/upstream/xingcezhenti`（已 gitignore，不入仓库）。

## 上游同步管线（手动触发）

镜像不依赖上游，上游更新不会自动进镜像，需要显式跑一次管线：

```bash
pnpm sync:upstream --pull --commit     # 更新上游 → 解析 → 转图 → 切分 → 校验 → 提交
pnpm sync:upstream                     # 用本地已有的上游副本同步（不更新上游、不提交）
pnpm sync:upstream --fresh             # 题库全量重建（清空旧题重解析）
pnpm sync:upstream --no-images         # 只更新题库，不转图
pnpm sync:upstream --no-db             # 只转图，不动题库
pnpm sync:upstream --vault <vault路径> # 用本地已有的原始题库副本（含 10-真题 / 90-图片）
pnpm sync:upstream --repo <git地址>    # 换上游仓库地址（或环境变量 KAOGONG_UPSTREAM_REPO）
pnpm sync:upstream --zip <zip或URL>    # 用仓库快照 zip（git 不通时走这条路）
pnpm sync:upstream --dry-run           # 只看计划，不写文件
```

上游副本定位顺序：`--vault` → 环境变量 `KAOGONG_VAULT` → `.cache/upstream/xingcezhenti`；
都没有且没给 `--vault` 时，自动浅克隆上游（含原图，首次约几百 MB）。

管线内部依次执行：

| 步骤 | 动作 | 产物 |
|---|---|---|
| 1 获取上游 | `git clone --depth 1` / `git pull --ff-only` / 解压 zip | `.cache/upstream/` 里的原始 Vault |
| 2 解析真题 | `scripts/parse.py`（`KAOGONG_VAULT=<vault>`） | `data/kaogong.db`（增量，`--fresh` 全量） |
| 3 图片转码 | `scripts/img2webp.py`（`90-图片` 原图 → WebP q88） | `data/images/`（已存在则跳过） |
| 4 切分卷 | `scripts/split-db.mjs` | `db/kaogong.db.part-NN`（30 MiB/卷，先清旧卷） |
| 5 校验 | `scripts/verify-assets.mjs` | 分卷/合并库字节一致、题数、图片张数 |
| 6 入库（`--commit`） | `git add db data/images && git commit` | 资产进仓库 |

> 环境要求：Python 3 + Pillow（`python -m pip install Pillow`），可用 `PYTHON=<路径>` 指定解释器。

同步完成后重新构建镜像即可：`docker compose up -d --build`。

## Docker 部署

```bash
docker compose up -d --build
```

- `docker-compose.yml` 暴露 `3000`，用户库 `users.db` 挂载到命名卷 `shuatila-data:/data`（持久化）。
- 题库库：builder 阶段 `db:assemble` 由分卷拼接，拷入镜像 `/app/data/kaogong.db`。
- 题库图片：运行阶段从仓库上下文 `COPY data/images` 到 `/app/data/images`（不进 builder，避免源码改动反复重传）。
- **构建期断言**：`scripts/verify-assets.mjs` 校验题库题数与图片张数，缺图/缺卷直接构建失败，不会再产出"没有图片"的镜像。
- 运行环境变量：`KAOGONG_DB_PATH`、`IMAGES_DIR`、`USERS_DB_PATH`（默认见 `lib/db.ts`）。


## 环境变量

见 `.env.example`。全部可选，均有默认值（`DATA_DIR` / `KAOGONG_DB_PATH` / `USERS_DB_PATH` / `IMAGES_DIR`）。

## GitHub Actions

- `ci.yml`：PR/推送触发，pnpm 安装 → `db:assemble` → typecheck → lint → 测试 → `next build`。
- `docker-publish.yml`：main 分支 / tag 触发，buildx 构建 **linux/amd64 + linux/arm64**，推送 `ghcr.io/<owner>/<repo>`（GitHub Container Registry，使用内置 `GITHUB_TOKEN`，无需额外密钥）。

## 认证

PBKDF2-HMAC-SHA256（200k 迭代，`salt$iter$dk`）口令哈希，兼容既有 `users.db`；支持游客、注册、登录、升级、注销。

## 技术栈

Next.js 15（App Router）/ React 19 / better-sqlite3 / TypeScript / Vitest / pnpm / Docker。

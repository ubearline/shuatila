# ShuaTiLa · 考公刷题系统

Next.js + better-sqlite3 实现的考公刷题平台（原「考公脑库」）。支持 SM-2 间隔重复、错题本、收藏、笔记、疑问、模拟考试、打卡统计、考点/资料/难点聚合，图片热力图与 WebP 题库图片内嵌展示。

## 数据架构（双库，不必迁移）

| 文件 | 作用 | 存放 |
|---|---|---|
| `kaogong.db` | 只读题库：27,506 题、58,890 真题出现记录、1,578 份材料 | 运行时 `data/`，由分卷 `db/kaogong.db.part-*` 拼接 |
| `users.db` | 用户数据：账号 / SRS 进度 / 评测记录 / 笔记 / 收藏 / 疑问 / 考试历史 / 设置 | `data/`，可 `USERS_DB_PATH` 覆盖，Docker 挂持久卷 |
| `data/images/` | 39,692 张 WebP 配图（题目图 + 公式图） | 运行时生成/挂载 |

跨库 JOIN 通过 SQLite `ATTACH DATABASE ... AS users` 实现（题库连接上把用户库附加为 `users`），路由 SQL 以 `users.srs` / `users.favorites` / `users.doubt_status` 前缀访问用户态。

## 本地启动（pnpm，秒级，不重头构建题库）

```bash
pnpm install            # 首次；node-linker=hoisted（见 .npmrc）
pnpm db:assemble        # 拼接 db/kaogong.db.part-* -> data/kaogong.db（秒级）
pnpm db:images          # （可选）首次生成 data/images WebP 配图
pnpm dev                # http://localhost:3000
```

> 题库分卷（5×~30MB）已入库；`db:assemble` 只做字节拼接，**不重新解析题库**，所以本地启动和 CI 构建都很快。`scripts/parse.py`（增量解析）与 `scripts/img2webp.py`（图片转码）保留在 `scripts/`，供**更新题库**时使用（非首启所需）。

## 题库更新管线（保留）

- `pnpm db:import` → `scripts/parse.py`：增量解析源数据（去重，新题写入 `data/kaogong.db`），产出路径 `/90-图片/…` 图片引用。
- `pnpm db:images` → `scripts/img2webp.py`：把 `90-图片/` 原图批量转 WebP 到 `data/images/`。
- 更新后：`scripts/split-db.mjs`（如有）重新切分 `data/kaogong.db` 为 `db/kaogong.db.part-*` 并提交，保证小文件入库、可发布。

## Docker 部署

```bash
docker compose up -d --build
```

- `docker-compose.yml` 暴露 `3000`，用户库 `users.db` 挂载到命名卷 `shuatila-data:/data`（持久化）。
- 题库库 + 图片在构建期由 builder 阶段 `db:assemble` 生成并拷入镜像 `/app/data/`。
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

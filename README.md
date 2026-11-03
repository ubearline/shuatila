# ShuaTiLa · 考公刷题系统

基于 Next.js 15 + SQLite（better-sqlite3）的公考行测刷题平台。题库覆盖 **27,473 道**历年真题（2,900 份试卷、6 大模块），内置 SM-2 间隔重复、错题本、收藏、笔记、疑问标记、模拟考试（服务端判分）、打卡统计与考点/资料聚合浏览，题图与公式图以 WebP 内嵌展示。

> 数据来自公开真题仓库 [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)（一卷一文件，qid 去重后 27,473 题），由本仓库 `scripts/parse-xingce.py` 解析入库。

## 功能一览

- **练习刷题**：按模块 / 子分类 / 地区 / 年份组合筛选，顺序或随机
- **模拟考试**：整卷限时作答，服务端判分（含多选题），交卷后可回看答案与官方解析
- **SM-2 间隔重复**：会做的题自动进入复习队列，按遗忘曲线安排
- **错题本 / 收藏 / 笔记 / 疑问标记**：跨设备跟随账号
- **材料题**：资料分析、篇章阅读等共享材料正确关联到所属题目
- **统计**：打卡日历热力图、正确率、薄弱点分析
- **游客模式**：无需注册即可试用，可随时升级为正式账号

## 快速开始

### 方式一：Docker 运行（推荐）

镜像已发布到 GitHub Container Registry（多架构：linux/amd64 + linux/arm64）：

```bash
sudo docker run -d \
  --name shuatila \
  -p 3000:3000 \
  -v shuatila-data:/data \
  -e USERS_DB_PATH=/data/users.db \
  --restart unless-stopped \
  ghcr.io/ubearline/shuatila:latest
```

启动后访问 <http://localhost:3000>。用户数据（账号 / 复习进度 / 笔记 / 收藏 / 模考记录）全部存在 `shuatila-data` 卷里，**升级镜像不丢数据**。

### 方式二：Docker Compose

仓库自带 `docker-compose.yml`：

```bash
# 使用 GHCR 镜像：把 compose 里的 image 改为 ghcr.io/ubearline/shuatila:latest 后
docker compose up -d

# 或本地构建
docker compose up -d --build
```

### 方式三：本地开发（pnpm）

```bash
pnpm install          # 首次；node-linker=hoisted（见 .npmrc）
pnpm db:assemble      # 拼接 db/kaogong.db.part-* -> data/kaogong.db（秒级，不重新解析）
pnpm dev              # http://localhost:3000
```

> 题库分卷（4 × ~25MB）与题库图片（`data/images`，39,698 张）均已入库，克隆即用，无需联网拉数据。

## 环境变量

全部可选，均有默认值（见 `.env.example` 与 `lib/db.ts`）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口（Docker） |
| `DATA_DIR` | `./data` | 数据根目录 |
| `KAOGONG_DB_PATH` | `<DATA_DIR>/kaogong.db` | 题库（只读） |
| `USERS_DB_PATH` | `<DATA_DIR>/users.db` | 用户库（Docker 中指向持久卷 `/data/users.db`） |
| `IMAGES_DIR` | `<DATA_DIR>/images` | 题图目录（只读） |
| `ALLOW_REGISTER` | `1` | `0` / `false` / `off` 关闭开放注册：登录页隐藏注册、拒绝注册与游客升级；游客模式不受影响 |

## 数据架构

| 文件 | 作用 | 说明 |
|---|---|---|
| `data/kaogong.db` | 只读题库：27,473 题 / 2,900 卷 | 由分卷 `db/kaogong.db.part-00..03` 字节拼接（`pnpm db:assemble`） |
| `data/users.db` | 用户数据：账号 / SRS / 模考 / 笔记 / 收藏 / 疑问 | 可 `USERS_DB_PATH` 覆盖，Docker 挂持久卷 |
| `data/images/` | 39,698 张 WebP 题图 + 公式图（87MB） | 入库，构建期打进镜像 |

跨库查询通过 SQLite `ATTACH DATABASE ... AS users` 实现：题库连接上附加用户库，路由 SQL 以 `users.*` 前缀访问用户态数据。

题库分卷与图片均提交在 git 仓库里，**镜像只基于本仓库构建，不依赖任何上游**；构建期 `scripts/verify-assets.mjs` 校验题数与图片张数，缺图/缺卷直接构建失败。

## 题库数据

来源与模块分布：

```
ERRRC/xingcezhenti（公开原始真题，一卷一文件）
   01-政治理论 / 02-常识判断 / 03-言语理解与表达
   04-数量关系 / 05-判断推理 / 06-资料分析 / 90-图片
        │  scripts/parse-xingce.py（qid 去重、材料关联、图片路径归一化）
        ▼
data/kaogong.db（27,473 题）→ scripts/split-db.mjs 切分卷 → db/kaogong.db.part-*
        │  Docker 构建期 assemble-db.mjs 拼接
        ▼
镜像（只基于本仓库）
```

| 模块 | 题量 |
|---|---|
| 判断推理 | 7,744 |
| 言语理解与表达 | 6,963 |
| 常识判断 | 4,857 |
| 资料分析 | 3,601 |
| 数量关系 | 3,224 |
| 政治理论 | 1,084 |

### 上游同步（数据更新）

上游更新后手动跑一次管线，把新资产同步进仓库并提交：

```bash
pnpm sync:upstream --pull --commit      # 拉上游 → 解析 → 转图 → 切分 → 校验 → git 提交
pnpm sync:upstream --dry-run            # 只看计划，不写文件
pnpm sync:upstream --fresh              # 题库全量重建
pnpm sync:upstream --no-images          # 只更新题库，跳过图片
```

管线内部依次执行：定位/拉取上游 → `parse-xingce.py` 解析入库 → `img2webp.py` 图片转码（WebP q88）→ `split-db.mjs` 切分卷（30MB/卷）→ `verify-assets.mjs` 校验 →（`--commit`）git 提交。

## 发版

镜像发布由 GitHub Actions 驱动（[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)）：

- 推送 `v*` tag → 构建多架构镜像并推送 GHCR（`vX.Y.Z` + `latest`）
- 仅推 main → 只跑轻量 CI（assemble / typecheck / test），**跳过**镜像 build/push

发版步骤：

```bash
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
```

## 项目结构

```
app/            Next.js App Router（页面 + API 路由）
components/     React 组件
lib/            数据库连接、SRS 算法、业务逻辑
db/             题库分卷（part-00..03，构建期拼接）
data/images/    题图（WebP，入库）
scripts/        数据管线（解析 / 转图 / 切分 / 校验 / 同步）
tests/          Vitest 测试
```

## 认证

PBKDF2-HMAC-SHA256（200k 迭代，`salt$iter$dk`）口令哈希；支持游客、注册、登录、游客升级、注销。

## Contributing

欢迎 Issue 与 PR：

1. Fork 本仓库并创建特性分支（`git checkout -b feat/xxx`）
2. 提交前跑 `pnpm test` 确认通过；涉及数据管线的改动请附抽样验证结果
3. 提交信息使用中文、一句话说清改动动机；PR 描述里写明验证方式

发现题目错误（题干 / 答案 / 解析 / 图片）欢迎开 Issue 并附上题目的 `qid`。

## License

[MIT](LICENSE)

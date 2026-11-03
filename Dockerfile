# ---------- 阶段 1：构建 ----------
# 组装题库分卷 + 编译 Next 产物。
# 层序原则（缓存友好）：最稳定的数据（图片/分卷）最先 COPY，源码最后 COPY，
# 这样日常改代码只失效源码之后的层；数据层（~310MB）命中缓存直接复用。
FROM node:20-alpine AS builder
WORKDIR /app
# better-sqlite3 原生模块：预编译失败时需本地编译工具
RUN apk add --no-cache python3 make g++
# 启用 pnpm（版本由 package.json 的 packageManager 决定）
RUN corepack enable && corepack prepare pnpm@10.16.1 --activate
# 1) 最稳定：题库分卷与图片（仅上游同步时才变动）
COPY db ./db
COPY data/images ./data/images
COPY scripts ./scripts
# 2) 依赖（lockfile 变动才失效）
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
# 3) 源码（日常迭代，只重建以下层）
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY tests ./tests
COPY next.config.mjs tsconfig.json ./
# 合并分卷 → data/kaogong.db（纯二进制拼接，秒级；不重头解析题库）
RUN node scripts/assemble-db.mjs && node -e "const D=require('better-sqlite3');const db=new D('data/kaogong.db',{readonly:true});console.log('q:',db.prepare('SELECT COUNT(*) n FROM questions').get().n)"
# 编译
RUN pnpm run build

# ---------- 阶段 2：运行 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    KAOGONG_DB_PATH=/app/data/kaogong.db \
    IMAGES_DIR=/app/data/images \
    USERS_DB_PATH=/data/users.db
# Next 产物 + 运行时依赖（better-sqlite3 原生绑定由 builder 在 alpine 编译）
# 层序原则：最稳定的数据层最先（与 builder 对齐，改代码不重传这 310MB）
COPY --from=builder /app/data/images ./data/images
COPY --from=builder /app/data/kaogong.db ./data/kaogong.db
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts/assemble-db.mjs ./scripts/assemble-db.mjs
COPY --from=builder /app/scripts/verify-assets.mjs ./scripts/verify-assets.mjs
# 次稳定：运行时依赖（lockfile 变动才重传）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# 静态资源（/logo.png、/brand-icon.png 等）由 next start 运行时直接从 public/ 目录读取，
# 不会打包进 .next；漏掉它会导致容器内 logo 404。必须随产物一并 COPY。
COPY --from=builder /app/public ./public
# 最易变：编译产物（每次代码改动都重建）
COPY --from=builder /app/.next ./.next
# 构建期断言：题库 + 图片都在，缺图直接让构建失败，而不是产出满是破图的镜像
RUN node scripts/verify-assets.mjs
# 用户数据落持久卷 /data（users.db）
VOLUME /data
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]

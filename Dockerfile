# ---------- 阶段 1：构建 ----------
# 组装题库分卷 + 编译 Next 产物
FROM node:20-alpine AS builder
WORKDIR /app
# better-sqlite3 原生模块：预编译失败时需本地编译工具
RUN apk add --no-cache python3 make g++
# 启用 pnpm（版本由 package.json 的 packageManager 决定）
RUN corepack enable && corepack prepare pnpm@10.16.1 --activate
# 先装依赖（利用层缓存；pnpm-lock.yaml 决定可复现安装）
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
# 拷贝源码 + 题库分卷
COPY . .
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
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# 只读题库库 + 分卷/装配脚本（数据卷缺失时可按需重建）
COPY --from=builder /app/data/kaogong.db ./data/kaogong.db
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts/assemble-db.mjs ./scripts/assemble-db.mjs
# 用户数据落持久卷 /data（users.db）
VOLUME /data
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]

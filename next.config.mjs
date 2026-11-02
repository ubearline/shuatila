/** @type {import('next').NextConfig} */
const nextConfig = {
  // 标准产物 + next start（Docker 内同款）。不用 standalone：
  //  - standalone 每次 build 会把 data/ 的 240MB（题库库+图片）重新追踪进产物，构建极慢
  //  - 避免 pnpm 符号链接在 Windows 上的 EPERM 问题
  reactStrictMode: true,
  // 允许 better-sqlite3 原生模块在 server component / route handler 中加载
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

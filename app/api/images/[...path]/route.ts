import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { IMAGES_DIR } from "@/lib/db";

// GET /api/images/[...path] —— 题库内嵌图片（WebP），从 IMAGES_DIR 流式返回。
// 实际 URL 仍是 /90-图片/...（题库 HTML 内嵌的 src），由 next.config 的 rewrites 转发到这里，
// 因为 Next 在 Windows 上对非 ASCII 动态路由目录名发现不稳定。
export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) => {
  const { path: segs } = await params;
  if (!segs?.length) return new Response("not found", { status: 404 });
  const rel = segs.join("/");
  // 路径穿越防护
  const abs = path.resolve(IMAGES_DIR, rel);
  if (!abs.startsWith(path.resolve(IMAGES_DIR) + path.sep)) {
    return new Response("forbidden", { status: 403 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return new Response("not found", { status: 404 });
  }
  const data = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".webp"
      ? "image/webp"
      : ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".gif"
      ? "image/gif"
      : "application/octet-stream";
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};

import { NextRequest, NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** 从请求中取 token：Authorization: Bearer / ?token= / kg_token cookie */
export function getToken(req: NextRequest): string {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const q = req.nextUrl.searchParams.get("token");
  if (q) return q.trim();
  const cookie = req.cookies.get("kg_token")?.value;
  return cookie ?? "";
}

/** 包装 handler，统一错误 → JSON 状态码 */
export function wrap<T>(
  fn: (req: NextRequest, ctx: T) => Promise<Response> | Response
): (req: NextRequest, ctx: T) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return json({ error: e.message }, 401);
      }
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
    }
  };
}

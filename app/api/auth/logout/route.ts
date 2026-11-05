import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid, logout } from "@/lib/auth";

// POST /api/auth/logout —— 只退出当前设备，不影响其他已登录端
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const token = getToken(req);
  const uid = needUid(token);
  logout(uid, token);
  return json({ ok: true });
});

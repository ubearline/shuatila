import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { getOrCreateGuest } from "@/lib/auth";

// POST /api/auth/guest —— 免注册游客身份（设备绑定）
// 前端传稳定的 deviceId（localStorage UUID）：同一浏览器重复进游客模式
// 复用同一账号与进度，不重复注册。
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const deviceId = String((body as { deviceId?: string }).deviceId || "").trim();
  if (!deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) {
    return json({ error: "缺少有效的 deviceId" }, 400);
  }
  const acc = getOrCreateGuest(deviceId);
  return json({ ok: true, token: acc.token, name: acc.name, id: acc.id, created: acc.created });
});

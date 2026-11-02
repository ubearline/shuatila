import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { createGuestAccount } from "@/lib/auth";

// POST /api/auth/guest —— 免注册游客身份
export const POST = wrap<unknown>(async () => {
  const acc = createGuestAccount();
  return json({ ok: true, token: acc.token, name: acc.name, id: acc.id });
});

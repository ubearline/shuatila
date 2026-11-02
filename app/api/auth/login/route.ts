import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { loginAccount } from "@/lib/auth";

// POST /api/auth/login  {username, password}
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const { username, password } = await req.json();
  const acc = loginAccount(String(username || "").trim(), String(password || ""));
  if (!acc) return json({ error: "用户名或密码不正确" }, 401);
  return json({ ok: true, token: acc.token, name: acc.name, id: acc.id });
});

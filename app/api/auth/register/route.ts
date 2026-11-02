import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { createAccount } from "@/lib/auth";
import { udb } from "@/lib/db";

// POST /api/auth/register  {username, password}
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const { username, password } = await req.json();
  const name = String(username || "").trim();
  const pw = String(password || "");
  if (!name || name.length > 40) return json({ error: "用户名不能为空且不超过 40 字符" }, 400);
  if (pw.length < 6) return json({ error: "密码至少 6 位" }, 400);
  const exists = udb().prepare("SELECT id FROM users WHERE username=?").get(name);
  if (exists) return json({ error: "用户名已被占用" }, 409);
  const acc = createAccount(name, pw);
  return json({ ok: true, token: acc.token, name: acc.name, id: acc.id });
});

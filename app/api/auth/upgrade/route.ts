import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid, upgradeAccount, isRegisterAllowed } from "@/lib/auth";
import { udb } from "@/lib/db";

// POST /api/auth/upgrade  {username, password} —— 游客升级为正式账号，数据不丢
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  if (!isRegisterAllowed()) return json({ error: "注册已关闭，请联系管理员" }, 403);
  const { username, password } = await req.json();
  const name = String(username || "").trim();
  const pw = String(password || "");
  if (!name || name.length > 40) return json({ error: "用户名不能为空且不超过 40 字符" }, 400);
  if (pw.length < 6) return json({ error: "密码至少 6 位" }, 400);
  const clash = udb()
    .prepare("SELECT id FROM users WHERE username=? AND id<>?")
    .get(name, uid);
  if (clash) return json({ error: "用户名已被占用" }, 409);
  const { token } = upgradeAccount(uid, name, pw);
  return json({ ok: true, token, name });
});

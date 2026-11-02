import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { authUid } from "@/lib/auth";
import { udb } from "@/lib/db";

// GET /api/auth/me —— 当前账号信息（未登录返回 {ok:false}）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = authUid(getToken(req));
  if (!uid) return json({ ok: false });
  const u = udb().prepare("SELECT id,name,anon FROM users WHERE id=?").get(uid) as
    | { id: string; name: string; anon: number }
    | undefined;
  if (!u) return json({ ok: false });
  return json({ ok: true, id: u.id, name: u.name, anon: !!u.anon });
});

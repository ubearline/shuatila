import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid, logout } from "@/lib/auth";

// POST /api/auth/logout
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  logout(uid);
  return json({ ok: true });
});

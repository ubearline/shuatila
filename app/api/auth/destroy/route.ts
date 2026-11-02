import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid, destroyAccount } from "@/lib/auth";

// POST /api/auth/destroy —— 游客退出并销毁其全部数据
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  destroyAccount(uid);
  return json({ ok: true });
});

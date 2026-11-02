import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { udb } from "@/lib/db";

// GET /api/favs —— 收藏 qid 列表
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const rows = udb().prepare("SELECT qid FROM favorites WHERE user_id=?").all(uid) as { qid: string }[];
  return json({ ids: rows.map((r) => r.qid) });
});

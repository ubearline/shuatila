import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { udb } from "@/lib/db";

// GET /api/exam/history —— 最近模考记录
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const rows = udb().prepare("SELECT * FROM exam_history WHERE user_id=? ORDER BY id DESC LIMIT 30").all(uid);
  return json({ rows });
});

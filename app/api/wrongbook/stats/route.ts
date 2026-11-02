import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { udb } from "@/lib/db";

// GET /api/wrongbook/stats —— 错题本统计
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const ud = udb();
  const total = (ud.prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND wrong>0").get(uid) as { n: number }).n;
  const mastered = (ud
    .prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND wrong>0 AND wb_status='cleared'")
    .get(uid) as { n: number }).n;
  return json({ total, mastered, pending: total - mastered });
});

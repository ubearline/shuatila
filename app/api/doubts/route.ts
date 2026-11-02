import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb } from "@/lib/db";

// GET /api/doubts?page&size&only —— 疑点复核列表（仅看当前用户的标记）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const uid = needUid(getToken(req));
  const page = Math.max(1, parseInt(g.get("page") || "1", 10) || 1);
  const size = Math.max(1, Math.min(50, parseInt(g.get("size") || "20", 10) || 20));
  const only = g.get("only"); // pending
  let cond = "q.doubt!=''";
  if (only === "pending") cond += " AND (ds.status IS NULL OR ds.status='')";
  const qd = qdb();
  const total = (qd
    .prepare(
      `SELECT COUNT(*) n FROM questions q LEFT JOIN users.doubt_status ds ON ds.qid=q.qid AND ds.user_id=?
       WHERE ${cond}`
    )
    .get(uid) as { n: number }).n;
  const rows = qd
    .prepare(
      `SELECT q.id,q.qid,q.module,q.category,q.kadian,q.region,q.year,q.doubt,
              ds.status ds_status, ds.note ds_note
       FROM questions q LEFT JOIN users.doubt_status ds ON ds.qid=q.qid AND ds.user_id=?
       WHERE ${cond} ORDER BY q.module,q.category LIMIT ? OFFSET ?`
    )
    .all(uid, size, (page - 1) * size);
  return json({ total, page, size, rows });
});

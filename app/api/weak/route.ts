import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";

// GET /api/weak —— 薄弱考点排行
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const qd = qdb();
  const rows = qd
    .prepare(
      `SELECT q.kadian kd, q.module m, q.category cat, COUNT(*) seen,
              SUM(s.correct) c, SUM(s.wrong) w, SUM(s.lapses) lp, MIN(s.ease) ease
       FROM questions q JOIN users.srs s ON s.qid=q.qid AND s.user_id=?
       WHERE s.status!='new' GROUP BY q.kadian
       HAVING seen>=1 AND (w>0 OR lp>0)
       ORDER BY (CAST(IFNULL(w,0) AS REAL)+IFNULL(lp,0))/seen DESC, ease ASC LIMIT 30`
    )
    .all(uid) as (Omit<
    { kd: string; m: string; cat: string; seen: number; c: number; w: number; lp: number; ease: number },
    "c" | "w" | "lp"
  > & {
    c: number | null;
    w: number | null;
    lp: number | null;
    acc?: number;
  })[];
  for (const r of rows) {
    const tot = (r.c || 0) + (r.w || 0);
    r.acc = tot ? Math.round(((r.c || 0) / tot) * 1000) / 10 : 0;
  }
  return json({ rows });
});

import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";

// GET /api/accuracy —— 各维度正确率
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const ud = udb();
  const qd = qdb();
  const agg = (col: string) =>
    qd
      .prepare(
        `SELECT q.${col} k, COUNT(*) n, SUM(s.correct) c, SUM(s.wrong) w
         FROM questions q JOIN users.srs s ON s.qid=q.qid AND s.user_id=?
         WHERE s.status!='new' GROUP BY q.${col} HAVING n>=1 ORDER BY n DESC LIMIT 40`
      )
      .all(uid);
  return json({
    module: agg("module"),
    category: agg("category"),
    region: agg("region"),
    year: agg("year"),
  });
});

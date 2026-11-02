import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";
import { buildWhere } from "@/lib/questions";

// GET /api/search?q&module&category&size —— 题干/考点关键词搜题
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const uid = needUid(getToken(req));
  const kw = (g.get("q") || "").trim();
  const size = Math.max(1, Math.min(60, parseInt(g.get("size") || "30", 10) || 30));
  const { sql: cond, args } = buildWhere(g.get("module") || undefined, g.get("category") || undefined, "");
  const qd = qdb();
  const ud = udb();
  if (!kw) return json({ total: 0, rows: [] });
  const like = "%" + kw + "%";
  const pre = kw + "%";
  const total = (qd
    .prepare(
      `SELECT COUNT(*) n FROM questions q LEFT JOIN users.srs s ON s.qid=q.qid AND s.user_id=?
       WHERE (q.stem LIKE ? OR q.kadian LIKE ?)${cond}`
    )
    .get(uid, like, like, ...args) as { n: number }).n;
  const rows = qd
    .prepare(
      `SELECT q.id,q.qid,q.module,q.category,q.kadian,q.region,q.year,q.stem,
              q.answer,q.ask_model,s.wrong,IFNULL(s.status,'new') status,
              (SELECT 1 FROM users.favorites f WHERE f.qid=q.qid AND f.user_id=?) fav
       FROM questions q LEFT JOIN users.srs s ON s.qid=q.qid AND s.user_id=?
       WHERE (q.stem LIKE ? OR q.kadian LIKE ?)${cond}
       ORDER BY (CASE WHEN q.stem LIKE ? THEN 0 ELSE 1 END), q.id LIMIT ?`
    )
    .all(uid, uid, like, like, ...args, pre, size) as {
    id: number;
    qid: string;
    module: string;
    category: string;
    kadian: string;
    region: string;
    year: string;
    stem: string;
    answer: string;
    ask_model: string;
    wrong: number;
    status: string;
    fav: number;
  }[];
  const out = rows.map((r) => ({
    id: r.id,
    qid: r.qid,
    module: r.module,
    category: r.category,
    kadian: r.kadian,
    region: r.region,
    year: r.year,
    answer: r.answer,
    wrong: r.wrong,
    status: r.status,
    fav: r.fav,
    snippet: r.stem.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 20),
  }));
  return json({ total, rows: out });
});

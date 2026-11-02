import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";
import { cleanCard, ensureSrsRows, buildWhere, QuestionRow } from "@/lib/questions";

// GET /api/browse?page&size&module&category&kadian&region&year&q&only
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(g.get("page") || "1", 10) || 1);
  const size = Math.max(1, Math.min(100, parseInt(g.get("size") || "25", 10) || 25));
  const uid = needUid(getToken(req));
  const { sql: base, args } = buildWhere(
    g.get("module") || undefined,
    g.get("category") || undefined,
    g.get("kadian") || undefined
  );
  const region = g.get("region");
  const year = g.get("year");
  const q = g.get("q");
  const only = g.get("only");

  const conds: string[] = [];
  const a: unknown[] = [];
  if (region) {
    conds.push("q.region=?");
    a.push(region);
  }
  if (year) {
    conds.push("q.year=?");
    a.push(year);
  }
  if (q) {
    conds.push("(q.stem LIKE ? OR q.analysis LIKE ? OR q.kadian LIKE ?)");
    const like = "%" + q + "%";
    a.push(like, like, like);
  }
  const extra = conds.length ? " AND " + conds.join(" AND ") : "";
  const off = (page - 1) * size;

  // 只读/收藏视图：先取 qid 集合，再查详情（带进度）
  let rows: QuestionRow[] = [];
  let total = 0;
  if (only === "wrong" || only === "fav") {
    const sub = only === "wrong" ? "SELECT qid FROM users.srs WHERE user_id=? AND wrong>0" : "SELECT qid FROM users.favorites WHERE user_id=?";
    const subArgs: unknown[] = [uid];
    const totalR = qdb()
      .prepare(`SELECT COUNT(*) n FROM questions q WHERE q.qid IN (${sub})${base}${extra}`)
      .get(...subArgs, ...args, ...a) as { n: number };
    total = totalR.n;
    rows = qdb()
      .prepare(
        `SELECT q.* FROM questions q JOIN users.srs s ON s.qid=q.qid AND s.user_id=? 
         WHERE q.qid IN (${sub})${base}${extra} ORDER BY q.id DESC LIMIT ? OFFSET ?`
      )
      .all(uid, ...subArgs, ...args, ...a, size, off) as QuestionRow[];
  } else {
    const totalR = qdb().prepare(`SELECT COUNT(*) n FROM questions q WHERE 1=1${base}${extra}`).get(...args, ...a) as { n: number };
    total = totalR.n;
    rows = qdb()
      .prepare(`SELECT q.* FROM questions q WHERE 1=1${base}${extra} ORDER BY q.id DESC LIMIT ? OFFSET ?`)
      .all(...args, ...a, size, off) as QuestionRow[];
  }
  if (rows.length) ensureSrsRows(uid, rows.map((r) => r.qid));
  return json({
    total,
    page,
    size,
    rows: rows.map((r) => cleanCard(r, true, uid)),
  });
});

import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";
import { cleanCard, ensureSrsRows, buildWhere, QuestionRow } from "@/lib/questions";
import { todayStr } from "@/lib/sm2";

// GET /api/next?mode&size&module&category&kadian&ref&ids&exclude
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const mode = g.get("mode") || "mix";
  const size = Math.max(1, Math.min(60, parseInt(g.get("size") || "10", 10) || 10));
  const uid = needUid(getToken(req));
  const { sql: cond, args } = buildWhere(
    g.get("module") || undefined,
    g.get("category") || undefined,
    g.get("kadian") || undefined
  );
  const ref = g.get("ref") || "";
  const excl = g.get("exclude") || "";
  const exclIds = excl
    ? excl.split(",").filter((x) => /^\d+$/.test(x.trim())).slice(0, 500)
    : [];
  const ea = [...args, ...exclIds];
  const J = "FROM questions q LEFT JOIN users.srs s ON s.qid=q.qid AND s.user_id=?";
  const NEW = "(s.qid IS NULL OR s.status='new')";
  const exclClause = exclIds.length ? ` AND q.qid NOT IN (${exclIds.map(() => "?").join(",")})` : "";
  const today = todayStr();
  const qd = qdb();

  let rows: QuestionRow[] = [];
  if (mode === "ids") {
    const ids = (g.get("ids") || "").split(",").filter((x) => /^\d+$/.test(x.trim())).slice(0, 200).map(Number);
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      rows = qd.prepare(`SELECT * FROM questions WHERE id IN (${ph})`).all(...ids) as QuestionRow[];
      const order = new Map(ids.map((x, i) => [x, i]));
      rows.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
    }
  } else if (mode === "material") {
    rows = qd
      .prepare(`SELECT * FROM questions WHERE material_ref=? ORDER BY id LIMIT ?`)
      .all(ref, size) as QuestionRow[];
  } else if (mode === "fav") {
    rows = qd
      .prepare(
        `SELECT q.* ${J} WHERE q.qid IN (SELECT qid FROM users.favorites WHERE user_id=?)${cond}${exclClause} ORDER BY RANDOM() LIMIT ?`
      )
      .all(uid, uid, ...ea, size) as QuestionRow[];
  } else if (mode === "wrongredo") {
    rows = qd
      .prepare(
        `SELECT q.* ${J} WHERE s.wrong>0 AND IFNULL(s.wb_status,'active')='active'${cond}${exclClause} ORDER BY RANDOM() LIMIT ?`
      )
      .all(uid, ...ea, size) as QuestionRow[];
  } else if (mode === "wrong") {
    rows = qd
      .prepare(
        `SELECT q.* ${J} WHERE s.wrong>0${cond}${exclClause} ORDER BY s.wrong DESC, s.ease ASC LIMIT ?`
      )
      .all(uid, ...ea, size) as QuestionRow[];
  } else if (mode === "review") {
    rows = qd
      .prepare(
        `SELECT q.* ${J} WHERE s.status!='new' AND s.due<=?${cond}${exclClause} ORDER BY s.due ASC, s.ease ASC LIMIT ?`
      )
      .all(uid, today, ...ea, size) as QuestionRow[];
  } else if (mode === "mix") {
    rows = qd
      .prepare(
        `SELECT q.* ${J} WHERE 1=1${cond} AND (s.wrong>0 OR s.lapses>0 OR (s.status!='new' AND s.due<=?))
         ORDER BY (CASE WHEN s.wrong>0 THEN 0 WHEN s.lapses>0 THEN 1 ELSE 2 END), s.due ASC, RANDOM() LIMIT ?`
      )
      .all(uid, today, ...args, size) as QuestionRow[];
    if (rows.length < size) {
      const fill = qd
        .prepare(
          `SELECT q.* ${J} WHERE 1=1${cond} AND ${NEW}${exclClause} ORDER BY RANDOM() LIMIT ?`
        )
        .all(uid, ...ea, size - rows.length) as QuestionRow[];
      rows = rows.concat(fill);
    }
  } else {
    // new / study / exam
    rows = qd
      .prepare(`SELECT q.* ${J} WHERE ${NEW}${cond}${exclClause} ORDER BY RANDOM() LIMIT ?`)
      .all(uid, ...ea, size) as QuestionRow[];
  }

  if (rows.length) ensureSrsRows(uid, rows.map((r) => r.qid));
  return json({
    mode,
    count: rows.length,
    cards: rows.map((r) => cleanCard(r, false)),
  });
});

import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";
import { stripLeakBlocks } from "@/lib/questions";

// GET /api/materials?size&page —— 资料分析材料组列表（分页）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const size = Math.max(1, Math.min(100, parseInt(req.nextUrl.searchParams.get("size") || "50", 10) || 50));
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get("page") || "0", 10) || 0);
  const db = qdb();
  const total = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM (SELECT material_ref FROM questions
       WHERE module='资料分析' AND material_ref!='' GROUP BY material_ref HAVING COUNT(*)>=2)`
    )
    .get() as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT g.ref, g.n, q.id rep_id, q.material, q.kadian
       FROM (SELECT material_ref ref, COUNT(*) n, MIN(id) rep
             FROM questions WHERE module='资料分析' AND material_ref!=''
             GROUP BY material_ref HAVING n>=2) g
       JOIN questions q ON q.id=g.rep
       ORDER BY g.n DESC LIMIT ? OFFSET ?`
    )
    .all(size, page * size) as { ref: string; n: number; rep_id: number; material: string; kadian: string }[];
  const out = rows.map((r) => ({
    ref: r.ref,
    n: r.n,
    rep_id: r.rep_id,
    kadian: r.kadian,
    snippet: stripLeakBlocks(r.material || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 70),
  }));
  return json({ rows: out, total, page, size });
});

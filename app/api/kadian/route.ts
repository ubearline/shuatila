import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";

// GET /api/kadian?module&category&size —— 考点聚合
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const size = Math.min(200, parseInt(g.get("size") || "50", 10) || 50);
  const conds: string[] = [];
  const args: unknown[] = [];
  if (g.get("module")) {
    conds.push("module=?");
    args.push(g.get("module"));
  }
  if (g.get("category")) {
    conds.push("category=?");
    args.push(g.get("category"));
  }
  const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
  const rows = qdb()
    .prepare(
      `SELECT kadian kd, module m, category c, COUNT(*) n,
              MAX(mother) mother FROM questions${where}
       GROUP BY module, category, kadian ORDER BY n DESC LIMIT ?`
    )
    .all(...args, size);
  return json({ rows });
});

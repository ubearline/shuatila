import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";

export type KadianRow = {
  name: string;
  module: string;
  category: string;
  qcount: number;
  regions: number;
  years: string;
  stances: string[];
};

// GET /api/kadian?module&category&q&size —— 考点导航（读蒸馏 Vault 的 20-考点 表）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const size = Math.min(300, parseInt(g.get("size") || "50", 10) || 50);
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
  if (g.get("q")) {
    conds.push("(name LIKE ? OR stances LIKE ?)");
    const kw = "%" + g.get("q") + "%";
    args.push(kw, kw);
  }
  const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
  const rows = qdb()
    .prepare(
      `SELECT name,module,category,qcount,regions,years,stances
       FROM kaodian${where} ORDER BY qcount DESC LIMIT ?`
    )
    .all(...args, size) as (Omit<KadianRow, "stances"> & { stances: string })[];
  const out: KadianRow[] = rows.map((r) => {
    let stances: string[] = [];
    try {
      stances = JSON.parse(r.stances || "[]");
    } catch {
      /* ignore */
    }
    return { ...r, stances };
  });
  return json({ rows: out });
});

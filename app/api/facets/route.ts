import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";

// GET /api/facets —— 地区/年份筛选选项
export const GET = wrap<unknown>(async () => {
  const db = qdb();
  const regions = db.prepare("SELECT DISTINCT region FROM questions WHERE region<>'' ORDER BY region").all().map((r) => (r as { region: string }).region);
  const years = db.prepare("SELECT DISTINCT year FROM questions WHERE year<>'' ORDER BY year DESC").all().map((r) => (r as { year: string }).year);
  return json({ regions, years });
});

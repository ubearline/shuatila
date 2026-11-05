import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";

// GET /api/facets —— 地区/年份筛选选项
// region 存在联考多值形态（"内蒙古;天津;…;湖南"），需按分号展开、去重、
// 并按题量降序（常用省份排前面），否则下拉会出现 2000+ 拼接串。
export const GET = wrap<unknown>(async () => {
  const db = qdb();
  const rows = db
    .prepare("SELECT region, COUNT(*) n FROM questions WHERE region<>'' GROUP BY region")
    .all() as { region: string; n: number }[];
  const counter = new Map<string, number>();
  for (const { region, n } of rows) {
    for (const part of region.split(";")) {
      const r = part.trim();
      if (!r) continue;
      counter.set(r, (counter.get(r) || 0) + n);
    }
  }
  const regions = [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .map(([r]) => r);
  const years = db.prepare("SELECT DISTINCT year FROM questions WHERE year<>'' ORDER BY year DESC").all().map((r) => (r as { year: string }).year);
  return json({ regions, years });
});

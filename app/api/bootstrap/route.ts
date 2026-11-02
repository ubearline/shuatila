import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";
import { todayStr } from "@/lib/sm2";

// GET /api/bootstrap —— 题库全局信息
export const GET = wrap<unknown>(async () => {
  const db = qdb();
  const total = db.prepare("SELECT COUNT(*) n FROM questions").get() as { n: number };
  const modules = db
    .prepare("SELECT module, COUNT(*) n FROM questions GROUP BY module ORDER BY n DESC")
    .all();
  const categories = db
    .prepare("SELECT module, category, COUNT(*) n FROM questions GROUP BY module,category ORDER BY n DESC")
    .all();
  return json({ total: total.n, modules, categories, today: todayStr() });
});

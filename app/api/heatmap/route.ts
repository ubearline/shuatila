import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { udb } from "@/lib/db";

// GET /api/heatmap?days=180 —— 每日做题数（近 N 天，含 0）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const days = Math.min(365, parseInt(req.nextUrl.searchParams.get("days") || "180", 10) || 180);
  const ud = udb();
  const rows = ud
    .prepare(
      "SELECT date(ts) d, COUNT(DISTINCT qid) n FROM reviews WHERE user_id=? AND ts>=? GROUP BY date(ts)"
    )
    .all(uid, new Date(Date.now() - days * 864e5).toISOString()) as { d: string; n: number }[];
  const map = new Map(rows.map((r) => [r.d, r.n]));
  const out: { d: string; n: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ d: key, n: map.get(key) || 0 });
  }
  return json({ days: out });
});

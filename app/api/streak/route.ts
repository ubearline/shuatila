import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { udb } from "@/lib/db";
import { todayStr } from "@/lib/sm2";

// GET /api/streak —— 连续打卡 / 最佳 / 目标
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const ud = udb();
  const dates = (ud.prepare("SELECT DISTINCT date(ts) d FROM reviews WHERE user_id=? ORDER BY d DESC").all(uid) as { d: string }[]).map((r) => r.d);
  const dset = new Set(dates);
  const today = todayStr();
  let cur = 0;
  let probe = new Date();
  if (!dset.has(today) && dates.length) probe.setDate(probe.getDate() - 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  while (dset.has(iso(probe))) {
    cur += 1;
    probe.setDate(probe.getDate() - 1);
  }
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of [...dset].sort()) {
    const [y, m, dd] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, dd);
    if (prev && Math.round((dt.getTime() - prev.getTime()) / 864e5) === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = dt;
  }
  const goalR = ud.prepare("SELECT value FROM settings WHERE key='daily_goal'").get() as { value: string } | undefined;
  const goal = parseInt(goalR?.value || "20", 10) || 20;
  const todayN = ud.prepare("SELECT COUNT(DISTINCT qid) n FROM reviews WHERE user_id=? AND date(ts)=?").get(uid, today) as { n: number };
  return json({ current: cur, best, goal, today: todayN.n });
});

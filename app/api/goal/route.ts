import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { udb } from "@/lib/db";

// POST /api/goal  {value}
export const POST = wrap<unknown>(async (req: NextRequest) => {
  await needUid(getToken(req)); // 需登录
  const p = await req.json();
  const v = Math.max(1, Math.min(500, parseInt(p.value, 10) || 20));
  udb().prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('daily_goal',?)").run(String(v));
  return json({ ok: true, goal: v });
});

import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { resolveQid } from "@/lib/db";
import { ensureSrsRows } from "@/lib/questions";
import { applyGrade } from "@/lib/srs";

// POST /api/grade  {id, grade, timeout?, choice?}
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const p = await req.json();
  const qidInt = parseInt(p.id, 10);
  const grade = parseInt(p.grade, 10);
  if (!qidInt || !grade) return json({ error: "id/grade required" }, 400);
  const uid = needUid(getToken(req));
  const timeout = p.timeout ? 1 : 0;
  const choice = (p.choice || "").toString().trim().slice(0, 4) || null;
  const eqid = resolveQid(qidInt);
  if (!eqid) return json({ error: "no such question" }, 404);
  ensureSrsRows(uid, [eqid]);
  const next = applyGrade(eqid, grade, uid, timeout, choice);
  return json({ ok: true, eqid, ...(next || {}) });
});

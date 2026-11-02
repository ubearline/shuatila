import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { resolveQid, udb } from "@/lib/db";
import { ensureSrsRows } from "@/lib/questions";
import { applyGrade } from "@/lib/srs";
import { nowIso } from "@/lib/sm2";

// POST /api/exam/submit  {title, duration, items:[{id, correct}]}
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const p = await req.json();
  const uid = needUid(getToken(req));
  const items: { id: number; correct: boolean; timeout?: boolean }[] = Array.isArray(p.items) ? p.items : [];
  const title = (p.title || "模拟考试").toString().trim().slice(0, 40);
  const duration = parseInt(p.duration, 10) || 0;
  const eqids = items.map((it) => resolveQid(parseInt(String(it.id), 10) || 0));
  ensureSrsRows(uid, eqids.filter(Boolean) as string[]);
  let correct = 0;
  const db = udb();
  const tx = db.transaction(() => {
    items.forEach((it, i) => {
      const eqid = eqids[i];
      if (!eqid) return;
      const ok = !!it.correct;
      if (ok) correct += 1;
      applyGrade(eqid, ok ? 4 : 1, uid, it.timeout ? 1 : 0);
    });
    const score = items.length ? Math.round((correct / items.length) * 1000) / 10 : 0;
    db.prepare("INSERT INTO exam_history(title,total,correct,score,duration,ts,user_id) VALUES(?,?,?,?,?,?,?)").run(
      title,
      items.length,
      correct,
      score,
      duration,
      nowIso(),
      uid
    );
    return score;
  });
  const score = tx();
  return json({ ok: true, total: items.length, correct, score });
});

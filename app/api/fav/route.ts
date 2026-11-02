import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { resolveQid, udb } from "@/lib/db";
import { ensureSrsRows } from "@/lib/questions";
import { nowIso } from "@/lib/sm2";

// POST /api/fav  {id, on}
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const p = await req.json();
  const eqid = resolveQid(parseInt(p.id, 10) || 0);
  if (!eqid) return json({ error: "no question" }, 404);
  const uid = needUid(getToken(req));
  const on = !!p.on;
  ensureSrsRows(uid, [eqid]);
  const db = udb();
  if (on) {
    db.prepare("INSERT OR IGNORE INTO favorites(qid,user_id,added) VALUES(?,?,?)").run(eqid, uid, nowIso());
  } else {
    db.prepare("DELETE FROM favorites WHERE qid=? AND user_id=?").run(eqid, uid);
  }
  return json({ ok: true, on });
});

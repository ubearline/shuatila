import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { resolveQid, udb } from "@/lib/db";
import { nowIso } from "@/lib/sm2";

// POST /api/doubt  {id, status, note}  （空 status 且空 note 删除）
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const p = await req.json();
  const eqid = resolveQid(parseInt(p.id, 10) || 0);
  if (!eqid) return json({ error: "no question" }, 404);
  const uid = needUid(getToken(req));
  const status = (p.status || "").toString().trim();
  const note = (p.note || "").toString().trim();
  const db = udb();
  if (status || note) {
    db.prepare("INSERT OR REPLACE INTO doubt_status(qid,user_id,status,note,updated) VALUES(?,?,?,?,?)").run(
      eqid,
      uid,
      status,
      note,
      nowIso()
    );
  } else {
    db.prepare("DELETE FROM doubt_status WHERE qid=? AND user_id=?").run(eqid, uid);
  }
  return json({ ok: true, status });
});

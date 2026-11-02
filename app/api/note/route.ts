import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { resolveQid, udb } from "@/lib/db";
import { nowIso } from "@/lib/sm2";

// POST /api/note  {id, text}  （空 text 删除笔记）
export const POST = wrap<unknown>(async (req: NextRequest) => {
  const p = await req.json();
  const eqid = resolveQid(parseInt(p.id, 10) || 0);
  if (!eqid) return json({ error: "no question" }, 404);
  const uid = needUid(getToken(req));
  const text = (p.text || "").toString().trim();
  const db = udb();
  if (text) {
    db.prepare("INSERT OR REPLACE INTO notes(qid,user_id,text,updated) VALUES(?,?,?,?)").run(eqid, uid, text, nowIso());
  } else {
    db.prepare("DELETE FROM notes WHERE qid=? AND user_id=?").run(eqid, uid);
  }
  return json({ ok: true, text });
});

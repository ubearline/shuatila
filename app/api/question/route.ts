import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";
import { cleanCard, ensureSrsRows, QuestionRow } from "@/lib/questions";

// GET /api/question?id= — 单题完整卡（含答案/解析/笔记/收藏）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const uid = needUid(getToken(req));
  const id = parseInt(req.nextUrl.searchParams.get("id") || "0", 10) || 0;
  const r = qdb().prepare("SELECT * FROM questions WHERE id=?").get(id) as QuestionRow | undefined;
  if (!r) return json({ error: "no such question" }, 404);
  ensureSrsRows(uid, [r.qid]);
  const srs = udb().prepare("SELECT * FROM srs WHERE qid=? AND user_id=?").get(r.qid, uid);
  return json({ card: cleanCard(r, true, uid), srs });
});

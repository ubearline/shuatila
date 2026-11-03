import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, resolveQid, udb } from "@/lib/db";
import { ensureSrsRows } from "@/lib/questions";
import { applyGrade } from "@/lib/srs";
import { nowIso } from "@/lib/sm2";

// POST /api/exam/submit  {title, duration, items:[{id, choice}]}（choice 为选项字母，多选为逗号拼接）
// 判分在服务端做：查 questions.answer 比对，前端不接触正确答案。
const norm = (s: unknown) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[^A-H]/g, "")
    .split("")
    .sort()
    .join("");

export const POST = wrap<unknown>(async (req: NextRequest) => {
  const p = await req.json();
  const uid = needUid(getToken(req));
  const items: { id: number; choice?: string; timeout?: boolean }[] = Array.isArray(p.items) ? p.items : [];
  const title = (p.title || "模拟考试").toString().trim().slice(0, 40);
  const duration = parseInt(p.duration, 10) || 0;
  const qd = qdb();

  // 服务端判分
  const graded = items.map((it) => {
    const row = qd.prepare("SELECT qid, answer FROM questions WHERE id=?").get(it.id) as
      | { qid: string; answer: string }
      | undefined;
    const eqid = row?.qid || resolveQid(it.id);
    const expected = norm(row?.answer);
    const picked = norm(it.choice);
    const correct = !!expected && picked === expected;
    return { it, eqid: eqid || row?.qid || "", correct, expected: row?.answer || "" };
  });

  ensureSrsRows(
    uid,
    graded.map((g) => g.eqid).filter(Boolean)
  );
  let correctCount = 0;
  const db = udb();
  const tx = db.transaction(() => {
    graded.forEach((g) => {
      if (!g.eqid) return;
      if (g.correct) correctCount += 1;
      applyGrade(g.eqid, g.correct ? 4 : 1, uid, g.it.timeout ? 1 : 0);
    });
    const score = items.length ? Math.round((correctCount / items.length) * 1000) / 10 : 0;
    db.prepare("INSERT INTO exam_history(title,total,correct,score,duration,ts,user_id) VALUES(?,?,?,?,?,?,?)").run(
      title,
      items.length,
      correctCount,
      score,
      duration,
      nowIso(),
      uid
    );
    return score;
  });
  const score = tx();
  // 回看解析：原始库卡片（reveal=false）不带 analysis，此处按 id 补齐
  const detail = graded.map((g) => {
    const r = qd.prepare("SELECT answer, analysis FROM questions WHERE id=?").get(g.it.id) as
      | { answer: string; analysis: string }
      | undefined;
    return { id: g.it.id, correct: g.correct, answer: r?.answer || g.expected, analysis: r?.analysis || "" };
  });
  return json({
    ok: true,
    total: items.length,
    correct: correctCount,
    score,
    detail,
  });
});

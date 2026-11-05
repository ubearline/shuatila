import { NextRequest } from "next/server";
import { json, wrap, getToken } from "@/lib/api";
import { needUid } from "@/lib/auth";
import { qdb, udb } from "@/lib/db";
import { todayStr, masteryBucket } from "@/lib/sm2";

// GET /api/stats —— 用户学习统计（总览）
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const t = todayStr();
  const uid = needUid(getToken(req));
  const ud = udb();
  const qd = qdb();

  const learned = ud.prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND status!='new'").get(uid) as { n: number };
  let totalQ = 0;
  (() => {
    const r = qd.prepare("SELECT COUNT(*) n FROM questions").get() as { n: number };
    totalQ = r.n;
  })();
  const dueNew = Math.max(0, totalQ - learned.n);
  const dueRev = ud.prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND status!='new' AND due<=?").get(uid, t) as { n: number };
  const studiedToday = ud
    .prepare("SELECT COUNT(DISTINCT qid) n FROM reviews WHERE user_id=? AND date(ts,'+8 hours')=?")
    .get(uid, t) as { n: number };
  const wrongN = ud.prepare("SELECT COUNT(*) n FROM srs WHERE user_id=? AND wrong>0").get(uid) as { n: number };
  const favN = ud.prepare("SELECT COUNT(*) n FROM favorites WHERE user_id=?").get(uid) as { n: number };

  // 题库库与用户库是两个独立连接，无法跨库 JOIN，改为 JS 合并：
  // qid→module 映射 + 各模块总量从题库库取，已学/待复习从用户库取。
  const modOf = new Map<string, string>();
  const modTotal = new Map<string, number>();
  for (const r of qd
    .prepare("SELECT qid, module FROM questions")
    .all() as { qid: string; module: string }[]) {
    modOf.set(r.qid, r.module);
    modTotal.set(r.module, (modTotal.get(r.module) || 0) + 1);
  }
  const learnedQids = ud
    .prepare("SELECT qid FROM srs WHERE user_id=? AND status!='new'")
    .all(uid) as { qid: string }[];
  const byModule = [...modTotal.entries()].map(([m, total]) => ({
    m,
    total,
    learned: learnedQids.filter((s) => modOf.get(s.qid) === m).length,
  }));
  const dueRows = ud
    .prepare("SELECT qid FROM srs WHERE user_id=? AND status!='new' AND due<=?")
    .all(uid, t) as { qid: string }[];
  const dueMod = new Map<string, number>();
  for (const s of dueRows) {
    const m = modOf.get(s.qid) || "未知";
    dueMod.set(m, (dueMod.get(m) || 0) + 1);
  }
  const dueByModule = [...dueMod.entries()].map(([m, n]) => ({ m, n }));

  const masteryRows = ud
    .prepare("SELECT interval FROM srs WHERE user_id=? AND status!='new'")
    .all(uid) as { interval: number }[];
  const buckets: Record<string, number> = { 学习中: 0, 初记: 0, 短期: 0, 长期: 0, 稳固: 0 };
  for (const r of masteryRows) buckets[masteryBucket(r.interval)] += 1;

  return json({
    new: dueNew,
    due_review: dueRev.n,
    learned: learned.n,
    studied_today: studiedToday.n,
    by_module: byModule,
    due_by_module: dueByModule,
    mastery: buckets,
    wrong: wrongN.n,
    fav: favN.n,
    total: totalQ,
  });
});

import { udb } from "./db";
import { gradeState, nowIso } from "./sm2";

/** 写入一次评分。含错题本状态机：连续 2 次自评「一般/熟悉」自动移出错题本。 */
export function applyGrade(
  eqid: string,
  grade: number,
  uid: string,
  timeout = 0,
  choice?: string | null
): {
  status: string;
  ease: number;
  interval: number;
  repetitions: number;
  lapses: number;
  due: string;
} | null {
  const db = udb();
  const st = db.prepare("SELECT * FROM srs WHERE qid=? AND user_id=?").get(eqid, uid) as
    | {
        interval: number;
        wrong: number;
        wb_status: string;
        wb_streak: number;
      }
    | undefined;
  if (!st) return null;
  const before = st.interval;
  const newSt = gradeState(st, grade);
  const correct = grade >= 3 ? 1 : 0;
  const wrongNow = (st.wrong || 0) + (correct ? 0 : 1);
  let streak = st.wb_streak || 0;
  let wb = st.wb_status || "active";
  if (wrongNow > 0) {
    if (correct && grade >= 4) {
      streak += 1;
      if (streak >= 2) wb = "cleared";
    } else {
      streak = 0;
      wb = "active";
    }
  }
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE srs SET status=?,ease=?,interval=?,repetitions=?,lapses=?,due=?,
         last_review=?, correct=correct+?, wrong=wrong+?, wb_status=?, wb_streak=?,
         last_choice=COALESCE(?,last_choice)
       WHERE qid=? AND user_id=?`
    ).run(
      newSt.status,
      newSt.ease,
      newSt.interval,
      newSt.repetitions,
      newSt.lapses,
      newSt.due,
      nowIso(),
      correct,
      correct ? 0 : 1,
      wb,
      streak,
      choice ?? null,
      eqid,
      uid
    );
    db.prepare(
      `INSERT INTO reviews(qid,user_id,grade,ts,interval_before,interval_after,ease,timeout)
       VALUES(?,?,?,?,?,?,?,?)`
    ).run(eqid, uid, grade, nowIso(), before, newSt.interval, newSt.ease, timeout ? 1 : 0);
  });
  tx();
  return newSt;
}

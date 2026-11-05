/**
 * SM-2 间隔重复引擎（移植自原 sm2.py，逻辑保持一致）。
 * 四档评分：忘记(1) / 困难(3) / 一般(4) / 熟悉(5)。interval 单位=天。
 */

export type SrsState = {
  ease: number;
  interval: number;
  repetitions: number;
  lapses: number;
  status: "new" | "learning" | "review";
  due: string; // YYYY-MM-DD
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  // 固定按北京时间（UTC+8）取日期：容器/部署机可能是 UTC，
  // 否则"今日"会在北京时间早上 8 点才翻转，晚间练习被算到第二天。
  const bjs = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000);
  const y = bjs.getFullYear();
  const m = String(bjs.getMonth() + 1).padStart(2, "0");
  const day = String(bjs.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 计算单次评分后的新状态。grade ∈ {1,3,4,5} */
export function gradeState(
  state: Partial<SrsState>,
  grade: number
): SrsState {
  const ease0 = Number(state.ease ?? 2.5);
  let ease = ease0;
  let interval = Number(state.interval ?? 0);
  let reps = Number(state.repetitions ?? 0);
  let lapses = Number(state.lapses ?? 0);
  let status = state.status ?? "new";
  grade = Number(grade);

  if (grade < 3) {
    // 忘记 / relearn
    reps = 0;
    interval = 0; // 今天再练
    if (status === "review") lapses += 1;
    status = "learning";
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else {
      const factor = grade === 3 ? 1.2 : grade === 4 ? 1.0 : 1.3;
      interval = Math.max(1, Math.round(interval * ease * factor));
    }
    // SM-2 ease 更新
    ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (ease < 1.3) ease = 1.3;
    status = reps >= 2 ? "review" : "learning";
  }

  const due = addDays(interval);
  return {
    ease: Math.round(ease * 1000) / 1000,
    interval,
    repetitions: reps,
    lapses,
    status,
    due,
  };
}

/** 掌握度分桶（总览统计用），基于 interval */
export function masteryBucket(interval: number): string {
  if (interval <= 0) return "学习中";
  if (interval < 7) return "初记";
  if (interval < 21) return "短期";
  if (interval < 60) return "长期";
  return "稳固";
}

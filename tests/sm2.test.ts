import { describe, expect, it } from "vitest";
import { gradeState, masteryBucket } from "../lib/sm2";

const base = { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, status: "new" as const, due: "" };

describe("SM-2 gradeState", () => {
  it("grade<3 回到学习期，间隔归零", () => {
    const st = gradeState({ ...base, status: "review", interval: 30 }, 1);
    expect(st.repetitions).toBe(0);
    expect(st.interval).toBe(0);
    expect(st.status).toBe("learning");
    expect(st.lapses).toBe(1); // review → 遗忘计 lapses
  });

  it("第一次正确 interval=1", () => {
    const st = gradeState(base, 4);
    expect(st.interval).toBe(1);
    expect(st.repetitions).toBe(1);
    expect(st.status).toBe("learning");
  });

  it("第二次正确 interval=6", () => {
    const st = gradeState({ ...base, repetitions: 1, interval: 1, status: "learning" }, 4);
    expect(st.interval).toBe(6);
    expect(st.status).toBe("review");
  });

  it("第三次后按 ease*factor 增长", () => {
    const st = gradeState({ ...base, repetitions: 2, interval: 6, status: "review" }, 5);
    expect(st.interval).toBe(Math.round(6 * 2.5 * 1.3));
  });

  it("ease 有下限 1.3", () => {
    const st = gradeState({ ...base, repetitions: 5, interval: 10, ease: 1.3 }, 3);
    expect(st.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("masteryBucket 分桶", () => {
    expect(masteryBucket(0)).toBe("学习中");
    expect(masteryBucket(3)).toBe("初记");
    expect(masteryBucket(10)).toBe("短期");
    expect(masteryBucket(30)).toBe("长期");
    expect(masteryBucket(90)).toBe("稳固");
  });
});

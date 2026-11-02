"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Acc = { k: string; n: number; c: number; w: number }[];
type Weak = { kd: string; m: string; cat: string; seen: number; c: number; w: number; lp: number; acc?: number }[];

export default function StatsPage() {
  const [acc, setAcc] = useState<{ module: Acc; category: Acc; region: Acc; year: Acc } | null>(null);
  const [weak, setWeak] = useState<Weak>([]);
  const [streak, setStreak] = useState<{ current: number; best: number; goal: number; today: number } | null>(null);
  const [heat, setHeat] = useState<{ d: string; n: number }[]>([]);

  useEffect(() => {
    api<{ module: Acc; category: Acc; region: Acc; year: Acc }>("/api/accuracy").then(setAcc).catch(() => {});
    api<{ rows: Weak }>("/api/weak").then((r) => setWeak(r.rows)).catch(() => {});
    api<{ current: number; best: number; goal: number; today: number }>("/api/streak").then(setStreak).catch(() => {});
    api<{ days: { d: string; n: number }[] }>("/api/heatmap").then((r) => setHeat(r.days)).catch(() => {});
  }, []);

  const accPct = (r: Acc[number]) => {
    const tot = (r.c || 0) + (r.w || 0);
    return tot ? Math.round(((r.c || 0) / tot) * 100) + "%" : "-";
  };
  const maxHeat = Math.max(1, ...heat.map((h) => h.n));

  return (
    <div>
      <h1>数据统计</h1>
      {streak && (
        <div className="grid" style={{ marginBottom: 14 }}>
          <div className="kpi"><div className="num">{streak.current}</div><div className="lbl">当前连续(天)</div></div>
          <div className="kpi"><div className="num">{streak.best}</div><div className="lbl">最佳连续</div></div>
          <div className="kpi"><div className="num">{streak.today}/{streak.goal}</div><div className="lbl">今日/目标</div></div>
        </div>
      )}

      <h2>近半年做题热力图</h2>
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {heat.map((h, i) => (
          <div
            key={h.d}
            title={`${h.d}: ${h.n} 题`}
            style={{
              width: 11,
              height: 11,
              borderRadius: 2,
              background: h.n === 0 ? "#242a35" : `rgba(37,99,235,${0.3 + (h.n / maxHeat) * 0.7})`,
            }}
          />
        ))}
      </div>

      {acc && (
        <>
          <h2>模块正确率</h2>
          <div className="card">
            <table>
              <thead><tr><th>模块</th><th>题次</th><th>正确率</th></tr></thead>
              <tbody>
                {acc.module.map((r) => (
                  <tr key={r.k}><td>{r.k}</td><td>{r.n}</td><td>{accPct(r)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>大类正确率</h2>
          <div className="card">
            <table>
              <thead><tr><th>大类</th><th>题次</th><th>正确率</th></tr></thead>
              <tbody>
                {acc.category.map((r) => (
                  <tr key={r.k}><td>{r.k}</td><td>{r.n}</td><td>{accPct(r)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>薄弱考点</h2>
      <div className="card">
        <table>
          <thead><tr><th>考点</th><th>模块</th><th>题次</th><th>错/忘</th><th>正确率</th></tr></thead>
          <tbody>
            {weak.map((r) => (
              <tr key={r.kd}>
                <td>{r.kd}</td><td>{r.m}</td><td>{r.seen}</td>
                <td>{(r.w || 0) + (r.lp || 0)}</td>
                <td>{r.acc !== undefined ? r.acc + "%" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

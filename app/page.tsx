"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Stats = {
  total: number;
  new: number;
  due_review: number;
  learned: number;
  studied_today: number;
  wrong: number;
  fav: number;
  by_module: { m: string; total: number; learned: number }[];
  mastery: Record<string, number>;
};

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    api<Stats>("/api/stats").then(setS).catch(() => {});
  }, []);

  if (!s) return <div className="center-page">加载中…</div>;
  const masteryKeys = ["学习中", "初记", "短期", "长期", "稳固"];
  const totalMastery = masteryKeys.reduce((a, k) => a + (s.mastery[k] || 0), 0);

  return (
    <div>
      <h1>总览</h1>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="num">{s.studied_today}</div>
          <div className="lbl">今日已练</div>
        </div>
        <div className="kpi">
          <div className="num">{s.due_review}</div>
          <div className="lbl">今日待复习</div>
        </div>
        <div className="kpi">
          <div className="num">{s.new}</div>
          <div className="lbl">未学新题</div>
        </div>
        <div className="kpi">
          <div className="num">{s.learned}</div>
          <div className="lbl">已学</div>
        </div>
        <div className="kpi">
          <div className="num">{s.wrong}</div>
          <div className="lbl">错题本</div>
        </div>
        <div className="kpi">
          <div className="num">{s.fav}</div>
          <div className="lbl">收藏</div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <Link href="/study" className="btn primary">
          开始练习
        </Link>
        <Link href="/study?mode=review" className="btn">
          复习到期（{s.due_review}）
        </Link>
        <Link href="/browse?only=wrong" className="btn">
          错题本
        </Link>
      </div>

      <h2>掌握度分布</h2>
      <div className="card">
        <div className="row">
          {masteryKeys.map((k) => {
            const v = s.mastery[k] || 0;
            const pct = totalMastery ? Math.round((v / totalMastery) * 100) : 0;
            return (
              <div key={k} style={{ flex: 1, minWidth: 90 }}>
                <div className="muted">{k}</div>
                <div className="progressbar">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="muted">{v}</div>
              </div>
            );
          })}
        </div>
      </div>

      <h2>模块进度</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>模块</th>
              <th>总题数</th>
              <th>已学</th>
              <th style={{ width: "40%" }}>进度</th>
            </tr>
          </thead>
          <tbody>
            {s.by_module.map((m) => (
              <tr key={m.m}>
                <td>{m.m}</td>
                <td>{m.total}</td>
                <td>{m.learned}</td>
                <td>
                  <div className="progressbar">
                    <div style={{ width: `${m.total ? Math.round((m.learned / m.total) * 100) : 0}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

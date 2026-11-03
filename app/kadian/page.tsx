"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Row = {
  name: string;
  module: string;
  category: string;
  qcount: number;
  regions: number;
  years: string;
  stances: string[];
};

export default function KadianPage() {
  const [module, setModule] = useState("");
  const [kw, setKw] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    const params: Record<string, string> = { size: "200" };
    if (module) params.module = module;
    if (kw) params.q = kw;
    const r = await api<{ rows: Row[] }>("/api/kadian", { params });
    setRows(r.rows);
  };
  useEffect(() => {
    load();
  }, [module]);

  return (
    <div>
      <h1>考点导航</h1>
      <p className="muted">
        来自上游蒸馏笔记的 20-考点：每个考点是该类题的「母题抽象 + 解题核心立场」汇总，可从考点直接进入同类题训练。
      </p>
      <div className="card">
        <div className="row">
          <select value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">全部模块</option>
            {["判断推理", "资料分析"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            placeholder="搜考点名 / 解题方法关键字…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button onClick={load}>查询</button>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>考点</th>
              <th>模块 / 大类</th>
              <th>题数</th>
              <th>地区</th>
              <th>年份</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.module + "/" + r.category + "/" + r.name}>
                <td>
                  <button
                    className="link"
                    onClick={() => setOpen(open === r.name ? null : r.name)}
                  >
                    {open === r.name ? "▾ " : "▸ "}{r.name}
                  </button>
                  {open === r.name && (
                    <ul className="stances">
                      {r.stances.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                      {r.stances.length === 0 && <li className="muted">（无核心立场条目）</li>}
                    </ul>
                  )}
                </td>
                <td>{r.module}{r.category ? " / " + r.category : ""}</td>
                <td>{r.qcount}</td>
                <td>{r.regions}</td>
                <td>{r.years}</td>
                <td>
                  <Link href={`/study?kadian=${encodeURIComponent(r.name)}`} className="info">
                    练同类题 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Row = { kd: string; m: string; c: string; n: number; mother: string };

export default function KadianPage() {
  const [module, setModule] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const params: Record<string, string> = { size: "100" };
    if (module) params.module = module;
    if (category) params.category = category;
    const r = await api<{ rows: Row[] }>("/api/kadian", { params });
    setRows(r.rows);
  };
  useEffect(() => {
    load();
  }, [module, category]);

  return (
    <div>
      <h1>考点导航</h1>
      <div className="card">
        <div className="row">
          <select value={module} onChange={(e) => { setModule(e.target.value); setCategory(""); }}>
            <option value="">全部模块</option>
            {["判断推理", "资料分析", "言语理解与表达", "常识判断", "数量关系", "政治理论"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input placeholder="筛选考点关键字…" onChange={(e) => setCategory(e.target.value)} />
          <button onClick={load}>查询</button>
        </div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>考点</th><th>模块</th><th>题数</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kd + r.m}>
                <td>{r.kd}</td>
                <td>{r.m}</td>
                <td>{r.n}</td>
                <td><Link href={`/study?kadian=${encodeURIComponent(r.kd)}`} className="info">练同类题 →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

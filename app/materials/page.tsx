"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Row = { ref: string; n: number; rep_id: number; snippet: string; kadian: string };

export default function MaterialsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<{ rows: Row[] }>("/api/materials", { params: { size: "50" } }).then((r) => setRows(r.rows)).catch(() => {});
  }, []);
  return (
    <div>
      <h1>材料组题（资料分析）</h1>
      <div className="muted" style={{ marginBottom: 10 }}>同一段材料成组出题，贴近考场节奏</div>
      {rows.map((r) => (
        <div className="card" key={r.ref}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="tag">{r.n} 题/组</span>
            <span className="tag">{r.kadian}</span>
          </div>
          <div className="muted">{r.snippet}</div>
          <Link href={`/study?mode=material&ref=${encodeURIComponent(r.ref)}`} className="info" style={{ fontSize: 13 }}>
            进入本组材料练习 →
          </Link>
        </div>
      ))}
    </div>
  );
}

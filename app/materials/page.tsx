"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Row = { ref: string; n: number; rep_id: number; snippet: string; kadian: string };
type Resp = { rows: Row[]; total: number; page: number; size: number };

const SIZE = 50;

export default function MaterialsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback((p: number) => {
    setLoading(true);
    api<Resp>("/api/materials", { params: { size: String(SIZE), page: String(p) } })
      .then((r) => {
        setRows((prev) => (p === 0 ? r.rows : [...prev, ...r.rows]));
        setTotal(r.total);
        setPage(r.page);
        if (r.rows.length < SIZE) setDone(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <div>
      <h1>材料组题（资料分析）</h1>
      <div className="muted" style={{ marginBottom: 10 }}>
        同一段材料成组出题，贴近考场节奏 · 共 {total} 组
      </div>
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
      {!done && rows.length > 0 && (
        <button
          onClick={() => load(page + 1)}
          disabled={loading}
          style={{ margin: "14px auto", display: "block", padding: "8px 24px" }}
        >
          {loading ? "加载中…" : `加载更多（已显示 ${rows.length}/${total}）`}
        </button>
      )}
      {rows.length === 0 && !loading && <div className="muted">暂无数据</div>}
    </div>
  );
}

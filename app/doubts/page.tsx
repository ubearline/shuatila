"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { sanitizeHtml } from "@/lib/sanitize";

type Row = {
  id: number;
  qid: string;
  module: string;
  category: string;
  kadian: string;
  region: string;
  year: string;
  doubt: string;
  ds_status: string;
  ds_note: string;
};

export default function DoubtsPage() {
  const [onlyPending, setOnlyPending] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params: Record<string, string> = { page: "1", size: "50" };
    if (onlyPending) params.only = "pending";
    const r = await api<{ rows: Row[]; total: number }>("/api/doubts", { params });
    setRows(r.rows);
    setTotal(r.total);
  }, [onlyPending]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = async (id: number, status: string) => {
    await api("/api/doubt", { method: "POST", body: { id, status } });
    load();
  };

  return (
    <div>
      <h1>疑点复核</h1>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={onlyPending ? "primary" : ""} onClick={() => setOnlyPending(true)}>仅看未复核</button>
        <button className={!onlyPending ? "primary" : ""} onClick={() => setOnlyPending(false)}>全部（{total}）</button>
      </div>
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="tag">{r.module}</span>
            <span className="tag">{r.category}</span>
            <span className="muted">{r.region} {r.year}</span>
            {r.ds_status && <span className="tag" style={{ background: "#173623", color: "#86efac" }}>已复核</span>}
          </div>
          {/* eslint-disable-next-line react/no-danger */}
          <div className="error" dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.doubt) }} />
          {r.ds_note && <div className="muted">备注：{r.ds_note}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <Link href={`/question/${r.id}`} className="info">打开题目 →</Link>
            {!r.ds_status && (
              <button onClick={() => mark(r.id, "resolved")}>标记已复核</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

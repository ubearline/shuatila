"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  answer: string;
  stem: string;
};

type Facets = { regions: string[]; years: string[] };

export default function BrowsePage() {
  const sp = useSearchParams();
  const only = sp.get("only") || "";
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [facets, setFacets] = useState<Facets>({ regions: [], years: [] });
  const [modules, setModules] = useState<{ module: string }[]>([]);

  const load = useCallback(async () => {
    const params: Record<string, string> = { page: String(page), size: "25" };
    if (module) params.module = module;
    if (category) params.category = category;
    if (region) params.region = region;
    if (year) params.year = year;
    if (q) params.q = q;
    if (only) params.only = only;
    const r = await api<{ rows: Row[]; total: number }>("/api/browse", { params });
    setRows(r.rows);
    setTotal(r.total);
  }, [page, module, category, region, year, q, only]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api<Facets>("/api/facets").then(setFacets).catch(() => {});
    api<{ modules: { module: string }[] }>("/api/bootstrap").then((r) => setModules(r.modules)).catch(() => {});
  }, []);

  const title = only === "wrong" ? "错题本" : only === "fav" ? "我的收藏" : "真题浏览";

  return (
    <div>
      <h1>{title}</h1>
      <div className="card">
        <div className="row">
          <input placeholder="题干关键词…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setPage(1)} />
          <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
            <option value="">全部模块</option>
            {modules.map((m) => (
              <option key={m.module} value={m.module}>
                {m.module}
              </option>
            ))}
          </select>
          <select value={region} onChange={(e) => { setRegion(e.target.value); setPage(1); }}>
            <option value="">全部地区</option>
            {facets.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }}>
            <option value="">全部年份</option>
            {facets.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button onClick={() => setPage(1)}>筛选</button>
        </div>
      </div>
      <div className="muted" style={{ marginBottom: 10 }}>
        共 {total} 题
      </div>
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="tag">{r.module}</span>
            <span className="tag">{r.category}</span>
            <span className="muted">
              {r.region} {r.year} · 答案 {r.answer}
            </span>
          </div>
          {/* eslint-disable-next-line react/no-danger */}
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.stem) }} />
          <Link href={`/question/${r.id}`} className="info" style={{ fontSize: 13 }}>
            查看详情 →
          </Link>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="empty">
          <div className="icon">🔍</div>
          <div>没有符合条件的题目</div>
          <div className="muted" style={{ marginTop: 4 }}>试试放宽筛选条件或更换关键词</div>
        </div>
      )}
      <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ← 上一页
        </button>
        <span className="muted">
          第 {page} 页 · 共 {Math.ceil(total / 25) || 1} 页
        </span>
        <button disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>
          下一页 →
        </button>
      </div>
    </div>
  );
}

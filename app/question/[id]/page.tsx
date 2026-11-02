"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { sanitizeHtml } from "@/lib/sanitize";

type Detail = {
  card: {
    id: number;
    qid: string;
    module: string;
    category: string;
    kadian: string;
    region: string;
    year: string;
    paper: string;
    ask_model: string;
    stem: string;
    material: string;
    answer: string;
    reasoning: string;
    fastest: string;
    pitfalls: string;
    mother: string;
    analysis: string;
    doubt: string;
    related: string;
    options: { key: string; label: string; html: string; is_answer?: boolean }[];
    fav?: number;
    note?: string;
  };
};

function Html({ html }: { html: string }) {
  // eslint-disable-next-line react/no-danger
  return <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || "") }} />;
}

export default function QuestionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail["card"] | null>(null);
  const [note, setNote] = useState("");
  const [editNote, setEditNote] = useState(false);

  useEffect(() => {
    api<Detail>("/api/question", { params: { id } }).then((r) => {
      setD(r.card);
      setNote(r.card.note || "");
    }).catch(() => {});
  }, [id]);

  if (!d) return <div className="center-page">加载中…</div>;

  const saveNote = async () => {
    await api("/api/note", { method: "POST", body: { id: d.id, text: note } });
    setEditNote(false);
  };
  const toggleFav = async () => {
    await api("/api/fav", { method: "POST", body: { id: d.id, on: !d.fav } });
    setD({ ...d, fav: d.fav ? 0 : 1 });
  };

  return (
    <div className="focus">
      <div className="row" style={{ marginBottom: 10 }}>
        <Link href="javascript:history.back()" className="muted">← 返回</Link>
        <span className="tag">{d.module}</span>
        <span className="tag">{d.category}</span>
        <span className="tag">{d.kadian}</span>
        <span className="muted">{d.region} {d.year} {d.paper}</span>
      </div>

      {d.ask_model && (
        <div className="card"><span className="muted">问法模型：</span>{d.ask_model}</div>
      )}
      {d.material && (
        <div className="card"><h2>给定材料</h2><Html html={d.material} /></div>
      )}

      <div className="card">
        <h2>题干</h2>
        <Html html={d.stem} />
        {d.options.map((o) => (
          <div key={o.key} className={o.is_answer ? "opt correct" : "opt"}>
            <span className="key">{o.key}.</span>
            <Html html={o.html} />
            {o.is_answer && <span className="tag" style={{ background: "#173623", color: "#86efac" }}>✓ 正确答案</span>}
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={toggleFav}>{d.fav ? "取消收藏 ★" : "收藏 ☆"}</button>
          <button onClick={() => setEditNote((v) => !v)}>📝 笔记</button>
        </div>
        {editNote && (
          <div style={{ marginTop: 8 }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ width: "100%" }} />
            <button onClick={saveNote}>保存笔记</button>
          </div>
        )}
        {d.note && !editNote && <div className="muted" style={{ marginTop: 6 }}>笔记：{d.note}</div>}
      </div>

      {d.reasoning && <div className="card"><h2>推理链</h2><Html html={d.reasoning} /></div>}
      {d.fastest && <div className="card"><h2>⚡ 最快解法</h2><Html html={d.fastest} /></div>}
      {d.pitfalls && <div className="card"><h2>⚠ 易错点</h2><Html html={d.pitfalls} /></div>}
      {d.mother && <div className="card"><h2>🧩 母题抽象</h2><Html html={d.mother} /></div>}
      {d.analysis && <div className="card"><h2>官方解析</h2><Html html={d.analysis} /></div>}
      {d.doubt && <div className="card"><h2 className="error">❓ 疑点</h2><Html html={d.doubt} /></div>}
    </div>
  );
}

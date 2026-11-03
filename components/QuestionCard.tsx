"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { sanitizeHtml } from "@/lib/sanitize";

export type Option = { key: string; label: string; html: string; is_answer?: boolean };
export type Card = {
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
  options: Option[];
  is_multi?: boolean;
  material: string;
  material_ref: string;
  answer?: string;
  reasoning?: string;
  fastest?: string;
  pitfalls?: string;
  mother?: string;
  analysis?: string;
  doubt?: string;
  related?: string;
  note?: string;
  fav?: number;
  kadian_meta?: {
    name: string;
    module: string;
    category: string;
    qcount: number;
    regions: number;
    years: string;
    stances: string[];
  } | null;
};

function Html({ html, cls }: { html: string; cls?: string }) {
  // eslint-disable-next-line react/no-danger
  return <div className={cls} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || "") }} />;
}

export function QuestionCard({
  card,
  onGrade,
  onNext,
  isReview,
}: {
  card: Card;
  onGrade: (g: number) => void;
  onNext: () => void;
  isReview?: boolean;
}) {
  const [revealed, setRevealed] = useState<Card | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMaterial, setShowMaterial] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState(false);

  const isMulti = !!card.is_multi;

  const doReveal = async (choice?: string) => {
    setLoading(true);
    try {
      const r = await api<{ card: Card }>("/api/question", { params: { id: String(card.id) } });
      setPicked(choice ? choice.split("") : []);
      setRevealed(r.card);
      setNoteText(r.card.note || "");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const togglePick = (key: string) => {
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  };

  const multiAnswerSet = (ans: string) => new Set((ans || "").toUpperCase().replace(/[^A-F]/g, "").split(""));
  const multiCorrect = revealed ? (() => {
    const ans = multiAnswerSet(revealed.answer || "");
    const user = new Set(picked);
    return ans.size > 0 && ans.size === user.size && [...ans].every((k) => user.has(k));
  })() : false;

  const saveNote = async () => {
    await api("/api/note", { method: "POST", body: { id: card.id, text: noteText } });
    setEditingNote(false);
    if (revealed) setRevealed({ ...revealed, note: noteText });
  };
  const toggleFav = async () => {
    const on = !revealed?.fav;
    await api("/api/fav", { method: "POST", body: { id: card.id, on } });
    if (revealed) setRevealed({ ...revealed, fav: on ? 1 : 0 });
  };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="tag">{card.module}</span>
        <span className="tag">{card.category}</span>
        <span className="tag">{card.kadian}</span>
        <span className="muted">
          {card.region} {card.year} · 第{card.id}题
        </span>
      </div>
      {card.material && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowMaterial((v) => !v)} className="muted" style={{ background: "none" }}>
            {showMaterial ? "收起材料 ▴" : "展开材料 ▾"}
          </button>
          {showMaterial && <Html html={card.material} />}
        </div>
      )}
      <Html html={card.stem} cls="stem" />

      {card.options.map((o) => {
        let cls = "opt";
        if (revealed) {
          const isAns = (revealed.answer || "").toUpperCase().includes(o.key);
          const isPicked = picked.includes(o.key);
          if (isAns) cls += " correct";
          else if (isPicked) cls += " wrong";
        } else if (isMulti && picked.includes(o.key)) {
          cls += " sel";
        }
        return (
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <label
            key={o.key}
            className={cls}
            onClick={() => {
              if (!revealed && !loading) {
                if (isMulti) togglePick(o.key);
                else doReveal(o.key);
              }
            }}
          >
            <span className="key">{o.key}.</span>
            <Html html={o.html} />
          </label>
        );
      })}

      {!revealed && !isReview && !isMulti && (
        <div className="muted" style={{ marginTop: 8 }}>
          点击选项作答
        </div>
      )}
      {!revealed && !isReview && isMulti && (
        <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted">多选题：点击选项勾选，可再点取消</span>
          <button onClick={() => doReveal(picked.join(""))} disabled={loading || picked.length === 0}>
            提交答案
          </button>
        </div>
      )}
      {revealed && isMulti && picked.length > 0 && (
        <div className={multiCorrect ? "ok" : "error"} style={{ marginTop: 10, fontWeight: 700 }}>
          {multiCorrect ? "回答正确 ✓" : "回答错误 ✗"}
        </div>
      )}
      {!revealed && isReview && (
        <button onClick={() => doReveal()} disabled={loading} style={{ marginTop: 10 }}>
          显示答案
        </button>
      )}

      {revealed && (
        <div style={{ marginTop: 14, borderTop: "1px solid #2a3240", paddingTop: 12 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="tag" style={{ background: "#173623", color: "#86efac" }}>
              答案 {revealed.answer}
            </span>
            <button onClick={toggleFav}>{revealed.fav ? "取消收藏 ★" : "收藏 ☆"}</button>
            <button onClick={() => setEditingNote((v) => !v)}>📝 笔记</button>
          </div>
          {editingNote && (
            <div style={{ marginBottom: 10 }}>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                style={{ width: "100%" }}
                placeholder="写点笔记…"
              />
              <button onClick={saveNote}>保存笔记</button>
            </div>
          )}
          {revealed.reasoning && (
            <div>
              <h3>推理链</h3>
              <Html html={revealed.reasoning} />
            </div>
          )}
          {revealed.fastest && (
            <div>
              <h3>⚡ 最快解法</h3>
              <Html html={revealed.fastest} />
            </div>
          )}
          {revealed.pitfalls && (
            <div>
              <h3>⚠ 易错点</h3>
              <Html html={revealed.pitfalls} />
            </div>
          )}
          {revealed.mother && (
            <div>
              <h3>🧩 母题抽象</h3>
              <Html html={revealed.mother} />
            </div>
          )}
          {revealed.kadian_meta && revealed.kadian_meta.stances.length > 0 && (
            <div>
              <h3>
                📐 考点方法论 · {revealed.kadian_meta.name}
                <span className="muted" style={{ fontWeight: 400, fontSize: "0.85em" }}>
                  {" "}（{revealed.kadian_meta.qcount} 题 · {revealed.kadian_meta.regions} 地区
                  {revealed.kadian_meta.years ? " · " + revealed.kadian_meta.years : ""}）
                </span>
              </h3>
              <ul className="stances">
                {revealed.kadian_meta.stances.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {revealed.analysis && (
            <div>
              <h3>官方解析</h3>
              <Html html={revealed.analysis} />
            </div>
          )}
          {revealed.doubt && (
            <div className="error">
              <h3>❓ 疑点</h3>
              <Html html={revealed.doubt} />
            </div>
          )}

          <div className="row" style={{ marginTop: 14 }}>
            <span className="muted">自评记忆强度：</span>
            {[
              [1, "忘记"],
              [3, "困难"],
              [4, "一般"],
              [5, "熟悉"],
            ].map(([g, t]) => (
              <button
                key={g}
                onClick={() => {
                  onGrade(Number(g));
                  setRevealed(null);
                  setPicked([]);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            <button
              onClick={() => {
                setRevealed(null);
                setPicked([]);
                onNext();
              }}
              className="muted"
              style={{ background: "none" }}
            >
              跳过/下一题 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

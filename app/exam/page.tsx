"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { sanitizeHtml } from "@/lib/sanitize";

type Opt = { key: string; label: string; html: string; is_answer?: boolean };
type Card = {
  id: number;
  stem: string;
  options: Opt[];
  is_multi?: boolean;
  material?: string;
  analysis?: string;
};
type Detail = { id: number; correct: boolean; answer: string; analysis?: string };
type ExamHistoryRow = { id: number; title: string; total: number; correct: number; score: number; duration: number; ts: string }[];

export default function ExamPage() {
  const [phase, setPhase] = useState<"config" | "running" | "done">("config");
  const [count, setCount] = useState(15);
  const [minutes, setMinutes] = useState(30);
  const [cards, setCards] = useState<Card[]>([]);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ total: number; correct: number; score: number } | null>(null);
  const [detail, setDetail] = useState<Detail[]>([]);
  const [history, setHistory] = useState<ExamHistoryRow>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = () =>
    api<{ rows: ExamHistoryRow }>("/api/exam/history").then((r) => setHistory(r.rows)).catch(() => {});
  useEffect(() => {
    loadHistory();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
    const r = await api<{ cards: Card[] }>("/api/next", { params: { mode: "new", size: String(count) } });
    setCards(r.cards);
    setAnswers({});
    setElapsed(0);
    setDetail([]);
    setPhase("running");
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const submit = async (timedOut = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const items = cards.map((c) => ({
      id: c.id,
      choice: (answers[c.id] || []).join(""),
      timeout: timedOut,
    }));
    const r = await api<{ total: number; correct: number; score: number; detail: Detail[] }>("/api/exam/submit", {
      method: "POST",
      body: { title: "模拟考试", duration: elapsed, items },
    });
    setResult(r);
    setDetail(r.detail || []);
    // 把解析合入 cards 供回看渲染
    const amap = new Map((r.detail || []).map((d) => [d.id, d.analysis]));
    setCards((prev) => prev.map((c) => (amap.get(c.id) ? { ...c, analysis: amap.get(c.id) } : c)));
    setPhase("done");
    loadHistory();
  };

  // 单选直接设；多选 toggle
  const pick = (c: Card, key: string) => {
    setAnswers((prev) => {
      const cur = prev[c.id] || [];
      if (c.is_multi) {
        return { ...prev, [c.id]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
      }
      return { ...prev, [c.id]: [key] };
    });
  };

  const detailOf = (id: number) => detail.find((d) => d.id === id);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const deadline = minutes * 60;
  const answered = cards.filter((c) => (answers[c.id] || []).length > 0).length;

  const renderQuestion = (c: Card, i: number, review: boolean) => {
    const d = review ? detailOf(c.id) : undefined;
    const picked = answers[c.id] || [];
    const ansKeys = review && d ? d.answer.toUpperCase().replace(/[^A-H]/g, "").split("") : [];
    return (
      <div className="card" key={c.id}>
        <div className="muted" style={{ marginBottom: 6 }}>
          第 {i + 1} 题
          {c.is_multi && <span className="tag" style={{ marginLeft: 8 }}>多选</span>}
          {review && d && (
            <span className="tag" style={{ marginLeft: 8, background: d.correct ? "#1d3a1d" : "#3f1d1d", color: d.correct ? "#a5fca5" : "#fca5a5" }}>
              {d.correct ? "✓ 答对" : "✗ 答错"}
            </span>
          )}
        </div>
        {!!c.material && (
          <div className="material" style={{ background: "#12161d", border: "1px solid #242a35", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 14 }}>
            <div className="muted" style={{ marginBottom: 4 }}>材料</div>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.material) }} />
          </div>
        )}
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.stem) }} />
        <div style={{ marginTop: 8 }}>
          {c.options.map((o) => {
            const isPicked = picked.includes(o.key);
            const isAns = review && ansKeys.includes(o.key);
            const cls = review
              ? "opt" + (isAns ? " correct" : isPicked ? " wrong" : "")
              : "opt" + (isPicked ? " correct" : "");
            return (
              <label
                key={o.key}
                className={cls}
                style={review ? { cursor: "default" } : undefined}
                onClick={review ? undefined : () => pick(c, o.key)}
              >
                <span className="key">{o.key}.</span>
                {/* eslint-disable-next-line react/no-danger */}
                <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(o.html) }} />
                {isPicked && <span className="muted" style={{ marginLeft: "auto" }}>（你的答案）</span>}
                {isAns && !isPicked && <span className="muted" style={{ marginLeft: "auto" }}>（正确答案）</span>}
              </label>
            );
          })}
        </div>
        {review && d && !d.correct && (
          <div className="muted" style={{ marginTop: 6 }}>正确答案：{d.answer}</div>
        )}
        {review && c.analysis && (
          <div style={{ marginTop: 10, borderTop: "1px solid #242a35", paddingTop: 10 }}>
            <div className="muted" style={{ marginBottom: 4 }}>官方解析</div>
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.analysis) }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1>模拟考试</h1>
      {phase === "config" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label>题量（{count} 题）
              <input type="number" min={5} max={60} value={count} onChange={(e) => setCount(Number(e.target.value) || 15)} style={{ marginLeft: 8, width: 70 }} />
            </label>
            <label>限时（分钟）
              <input type="number" min={5} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 30)} style={{ marginLeft: 8, width: 70 }} />
            </label>
            <button className="primary" onClick={start}>开始组卷</button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="tag" style={{ background: elapsed >= deadline ? "#3f1d1d" : "", color: elapsed >= deadline ? "#fca5a5" : "" }}>
              倒计时 {mm}:{ss} / {minutes}:00
            </span>
            <span className="muted">已答 {answered}/{cards.length}</span>
            <button onClick={() => submit()} className="primary" disabled={answered === 0}>交卷</button>
          </div>
          {elapsed >= deadline && <div className="error">时间到，自动交卷</div>}
          {cards.map((c, i) => renderQuestion(c, i, false))}
        </div>
      )}

      {phase === "done" && result && (
        <div>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{result.score}</div>
            <div className="muted">得分</div>
            <div className="muted">答对 {result.correct} / {result.total}</div>
            <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
              <button onClick={() => setPhase("config")} className="primary">再来一套</button>
            </div>
          </div>
          <h2>试卷回看</h2>
          {cards.map((c, i) => renderQuestion(c, i, true))}
        </div>
      )}

      <h2>历史成绩</h2>
      <div className="card">
        <table>
          <thead><tr><th>时间</th><th>标题</th><th>对/总</th><th>得分</th><th>用时</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.ts).toLocaleString()}</td>
                <td>{h.title}</td>
                <td>{h.correct}/{h.total}</td>
                <td>{h.score}</td>
                <td>{Math.floor(h.duration / 60)}分{h.duration % 60}秒</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

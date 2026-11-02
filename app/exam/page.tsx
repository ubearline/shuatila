"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { sanitizeHtml } from "@/lib/sanitize";

type Card = { id: number; stem: string; options: { key: string; label: string; html: string }[] };
type ExamHistoryRow = { id: number; title: string; total: number; correct: number; score: number; duration: number; ts: string }[];

export default function ExamPage() {
  const [phase, setPhase] = useState<"config" | "running" | "done">("config");
  const [count, setCount] = useState(15);
  const [minutes, setMinutes] = useState(30);
  const [cards, setCards] = useState<Card[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ total: number; correct: number; score: number } | null>(null);
  const [history, setHistory] = useState<ExamHistoryRow>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = () =>
    api<{ rows: ExamHistoryRow }>("/api/exam/history").then((r) => setHistory(r.rows)).catch(() => {});
  useEffect(() => {
    loadHistory();
  }, []);

  const start = async () => {
    const r = await api<{ cards: Card[] }>("/api/next", { params: { mode: "new", size: String(count) } });
    setCards(r.cards);
    setAnswers({});
    setElapsed(0);
    setPhase("running");
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const submit = async (timedOut = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const items = cards.map((c) => ({
      id: c.id,
      correct: answers[c.id] !== undefined && answers[c.id] === correctOf(c.id),
      timeout: timedOut,
    }));
    const r = await api<{ total: number; correct: number; score: number }>("/api/exam/submit", {
      method: "POST",
      body: { title: "模拟考试", duration: elapsed, items },
    });
    setResult(r);
    setPhase("done");
    loadHistory();
  };

  const correctOf = (id: number) => {
    // 交卷判分在服务端做；此处仅用「选项回显」占位，不本地判分
    return "";
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const deadline = minutes * 60;

  return (
    <div>
      <h1>模拟考试</h1>
      {phase === "config" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label>题量（≤{count} 新题）
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
            <span className="muted">已答 {Object.keys(answers).length}/{cards.length}</span>
            <button onClick={() => submit()} className="primary">交卷</button>
          </div>
          {elapsed >= deadline && <div className="error">时间到，自动交卷</div>}
          {cards.map((c, i) => (
            <div className="card" key={c.id}>
              <div className="muted" style={{ marginBottom: 6 }}>第 {i + 1} 题</div>
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.stem) }} />
              {c.options.map((o) => (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                <label key={o.key} className={answers[c.id] === o.key ? "opt correct" : "opt"} onClick={() => setAnswers({ ...answers, [c.id]: o.key })}>
                  <span className="key">{o.key}.</span>
                  {/* eslint-disable-next-line react/no-danger */}
                  <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(o.html) }} />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      {phase === "done" && result && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{result.score}</div>
          <div className="muted">得分</div>
          <div className="muted">答对 {result.correct} / {result.total}</div>
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button onClick={() => setPhase("config")} className="primary">再来一套</button>
          </div>
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

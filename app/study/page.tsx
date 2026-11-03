"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { QuestionCard, Card } from "@/components/QuestionCard";

type Config = { mode: string; size: number; module?: string; category?: string; kadian?: string; ref?: string; matReview?: boolean };

const MODES: { id: string; label: string; hint?: string }[] = [
  { id: "mix", label: "混合（错题+到期+新题）", hint: "推荐的日常模式：优先错题和到期复习，不足补新题" },
  { id: "new", label: "新题", hint: "只做没学过的题，适合首轮过知识点" },
  { id: "review", label: "到期复习", hint: "按遗忘曲线到期的题，今天该复习的都在这" },
  { id: "wrong", label: "只练错题", hint: "全量回顾所有历史错题（含已掌握的），适合考前扫尾" },
  { id: "wrongredo", label: "错题重练（未稳定）", hint: "只练错题本中还没连续做对 2 次的题，做稳后自动毕业" },
  { id: "fav", label: "收藏", hint: "只练收藏过的题" },
  { id: "material", label: "材料组题", hint: "随机抽一组资料分析材料成组练习，贴近考场节奏" },
];

export default function StudyPage() {
  const sp = useSearchParams();
  const [modules, setModules] = useState<{ module: string; n: number }[]>([]);
  const [cfg, setCfg] = useState<Config>({
    mode: (sp.get("mode") as string) || "mix",
    size: 10,
    module: sp.get("module") || undefined,
    category: sp.get("category") || undefined,
    kadian: sp.get("kadian") || undefined,
    ref: sp.get("ref") || undefined,
  });
  const [started, setStarted] = useState(false);
  const [emptyHit, setEmptyHit] = useState(false);
  const [queue, setQueue] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(0);
  const excludeRef = useRef<string[]>([]);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    api<{ modules: { module: string; n: number }[] }>("/api/bootstrap").then((r) => setModules(r.modules));
  }, []);

  // 从"进入练习"类入口（带明确模式 / kadian / ref 等预选参数）跳转而来时直接开始练习，
  // 而不是停在配置页；仅裸进入 /study 才显示配置页供选择。
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    const hasIntent =
      cfg.mode !== "mix" || Boolean(cfg.kadian || cfg.ref || cfg.module || cfg.category);
    if (hasIntent) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    const params: Record<string, string> = { mode: cfg.mode, size: String(cfg.size) };
    if (cfg.module) params.module = cfg.module;
    if (cfg.category) params.category = cfg.category;
    if (cfg.kadian) params.kadian = cfg.kadian;
    if (cfg.ref) params.ref = cfg.ref;
    if (cfg.mode === "material" && cfg.matReview) params.review = "1";
    const r = await api<{ cards: Card[] }>("/api/next", { params });
    setQueue(r.cards);
    setIdx(0);
    setStarted(true);
    if (r.cards.length === 0) setEmptyHit(true);
  };

  const more = async () => {
    const params: Record<string, string> = {
      mode: cfg.mode,
      size: String(cfg.size),
      exclude: excludeRef.current.slice(-500).join(","),
    };
    if (cfg.module) params.module = cfg.module;
    if (cfg.category) params.category = cfg.category;
    if (cfg.kadian) params.kadian = cfg.kadian;
    if (cfg.ref) params.ref = cfg.ref;
    const r = await api<{ cards: Card[] }>("/api/next", { params });
    return r.cards;
  };

  const grade = async (g: number) => {
    const c = queue[idx];
    if (!c) return;
    excludeRef.current.push(String(c.id));
    await api("/api/grade", { method: "POST", body: { id: c.id, grade: g } });
    setDone((d) => d + 1);
    next();
  };

  const next = useCallback(async () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      return;
    }
    // 队列耗尽：续拉新题并跳到第一批追加的题目
    const cards = await more();
    if (cards.length) {
      const firstNew = queue.length;
      setQueue((q) => q.concat(cards));
      setIdx(firstNew);
    } else {
      setStarted(false);
    }
  }, [idx, queue.length]);

  if (!started) {
    return (
      <div>
        <h1>开始练习</h1>
        {emptyHit && (
          <div className="empty" style={{ marginBottom: 14 }}>
            <div className="icon">📭</div>
            <div>这个模式下暂时没有可练的题</div>
            <div className="muted" style={{ marginTop: 4 }}>
              {cfg.mode === "review" && "还没有到期的复习题——先练些新题吧"}
              {cfg.mode === "wrong" && "错题本是空的，太棒了！去练新题吧"}
              {cfg.mode === "wrongredo" && "没有未稳定的错题——去练新题或做复习吧"}
              {cfg.mode === "fav" && "还没有收藏题，做题时点「收藏 ☆」即可加入"}
              {cfg.mode === "material" && "材料组加载失败，请重试"}
            </div>
          </div>
        )}
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label>
              模式
              <select
                value={cfg.mode}
                onChange={(e) => setCfg({ ...cfg, mode: e.target.value })}
                style={{ width: "100%", marginTop: 4 }}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {MODES.find((m) => m.id === cfg.mode)?.hint && (
              <div className="muted" style={{ marginTop: -6, fontSize: 12.5 }}>
                💡 {MODES.find((m) => m.id === cfg.mode)?.hint}
              </div>
            )}
            <label>
              模块
              <select
                value={cfg.module || ""}
                onChange={(e) => setCfg({ ...cfg, module: e.target.value || undefined })}
                style={{ width: "100%", marginTop: 4 }}
              >
                <option value="">全部模块</option>
                {modules.map((m) => (
                  <option key={m.module} value={m.module}>
                    {m.module}（{m.n}）
                  </option>
                ))}
              </select>
            </label>
            {cfg.mode === "material" && !cfg.ref && (
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.matReview)}
                  onChange={(e) => setCfg({ ...cfg, matReview: e.target.checked })}
                />
                只练到期复习题（需先练过本组才会到期）
              </label>
            )}
            <label>
              每题批数量
              <input
                type="number"
                min={1}
                max={60}
                value={cfg.size}
                onChange={(e) => setCfg({ ...cfg, size: Number(e.target.value) || 10 })}
                style={{ width: 80, marginLeft: 8 }}
              />
            </label>
            <button className="primary" onClick={start}>
              开始
            </button>
          </div>
        </div>
      </div>
    );
  }

  const c = queue[idx];
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="progressbar" style={{ flex: 1 }}>
          <div style={{ width: `${(done / 20) * 100}%` }} />
        </div>
        <span className="muted">
          已评 {done} 题 · 第 {idx + 1}/{queue.length}
        </span>
      </div>
      {c ? (
        <QuestionCard card={c} onGrade={grade} onNext={next} isReview={cfg.mode === "review"} />
      ) : (
        <div className="empty">
          <div className="icon">🎉</div>
          <div>这一批做完了，干得漂亮！</div>
          <div className="row" style={{ marginTop: 12, justifyContent: "center" }}>
            <button className="primary" onClick={more}>继续加载</button>
            <button onClick={() => setStarted(false)}>返回配置</button>
          </div>
        </div>
      )}
    </div>
  );
}

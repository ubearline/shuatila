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

// 练习会话持久化：切走再切回（或刷新页面）不丢答题进度。
// 只存队列的题目 id 与位置，题目内容从 /api/next?mode=ids 重新拉取（ids 模式按 id 原序返回）。
const SS_KEY = "study-session-v1";

type SavedSession = {
  cfg: Config;
  ids: number[];
  idx: number;
  done: number;
  exclude: string[];
  ts: number;
};

function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    // 超过 12 小时的会话视为过期
    if (!s.cfg || !Array.isArray(s.ids) || s.ids.length === 0 || Date.now() - s.ts > 12 * 3600 * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

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
  const [resume, setResume] = useState<SavedSession | null>(null);
  const excludeRef = useRef<string[]>([]);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    api<{ modules: { module: string; n: number }[] }>("/api/bootstrap").then((r) => setModules(r.modules));
  }, []);

  // 挂载时检查是否有未完成的练习会话（仅裸进入 /study 时提示恢复）
  useEffect(() => {
    const saved = loadSession();
    if (saved) setResume(saved);
  }, []);

  // 答题过程中持续保存会话
  useEffect(() => {
    if (!started || queue.length === 0) return;
    const s: SavedSession = {
      cfg,
      ids: queue.map((c) => c.id),
      idx,
      done,
      exclude: excludeRef.current.slice(-500),
      ts: Date.now(),
    };
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify(s));
    } catch {}
  }, [started, queue, idx, done, cfg]);

  const doStart = async (startCfg: Config) => {
    const params: Record<string, string> = { mode: startCfg.mode, size: String(startCfg.size) };
    if (startCfg.module) params.module = startCfg.module;
    if (startCfg.category) params.category = startCfg.category;
    if (startCfg.kadian) params.kadian = startCfg.kadian;
    if (startCfg.ref) params.ref = startCfg.ref;
    if (startCfg.mode === "material" && startCfg.matReview) params.review = "1";
    const r = await api<{ cards: Card[] }>("/api/next", { params });
    setQueue(r.cards);
    setIdx(0);
    setDone(0);
    setStarted(true);
    if (r.cards.length === 0) setEmptyHit(true);
  };

  // 恢复上次会话：按保存的 id 顺序拉回题目，定位到离开时的题
  const resumeSession = async (s: SavedSession) => {
    const r = await api<{ cards: Card[] }>("/api/next", {
      params: { mode: "ids", size: String(s.ids.length), ids: s.ids.join(",") },
    });
    if (!r.cards.length) {
      setResume(null);
      sessionStorage.removeItem(SS_KEY);
      return;
    }
    setCfg(s.cfg);
    setQueue(r.cards);
    setIdx(Math.min(s.idx, r.cards.length - 1));
    setDone(s.done);
    excludeRef.current = s.exclude || [];
    setResume(null);
    setStarted(true);
  };

  const discardSession = () => {
    sessionStorage.removeItem(SS_KEY);
    setResume(null);
  };

  const start = async () => {
    discardSession();
    await doStart(cfg);
  };

  // 从"进入练习"类入口（带明确模式 / kadian / ref 等预选参数）跳转而来时直接开始练习，
  // 而不是停在配置页；仅裸进入 /study 才显示配置页供选择（此时若有未完成会话则提示恢复）。
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    const hasIntent =
      cfg.mode !== "mix" || Boolean(cfg.kadian || cfg.ref || cfg.module || cfg.category);
    if (hasIntent) {
      discardSession();
      doStart(cfg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, queue.length]);

  // 主动结束本次练习：清掉会话存档，回到配置页
  const endSession = () => {
    if (done > 0 && !confirm(`本次已练 ${done} 题，评分已保存。确定结束吗？`)) return;
    sessionStorage.removeItem(SS_KEY);
    setQueue([]);
    setIdx(0);
    setDone(0);
    setStarted(false);
  };

  if (!started) {
    return (
      <div>
        <h1>开始练习</h1>
        {resume && (
          <div className="card" style={{ borderColor: "var(--accent)", marginBottom: 14, maxWidth: 560 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>⏸ 有未完成的练习</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              {MODES.find((m) => m.id === resume.cfg.mode)?.label || resume.cfg.mode}
              {resume.cfg.module ? ` · ${resume.cfg.module}` : ""} · 已评 {resume.done} 题 · 进行到第 {resume.idx + 1}/{resume.ids.length} 题
            </div>
            <div className="row">
              <button className="primary" onClick={() => resumeSession(resume)}>继续上次练习</button>
              <button className="ghost" onClick={discardSession}>放弃</button>
            </div>
          </div>
        )}
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
        <button className="ghost" onClick={endSession} title="结束本次练习（已评分的题会保留进度）">
          结束练习 ✕
        </button>
      </div>
      {c ? (
        <QuestionCard card={c} onGrade={grade} onNext={next} isReview={cfg.mode === "review"} />
      ) : (
        <div className="empty">
          <div className="icon">🎉</div>
          <div>这一批做完了，干得漂亮！</div>
          <div className="row" style={{ marginTop: 12, justifyContent: "center" }}>
            <button className="primary" onClick={more}>继续加载</button>
            <button onClick={endSession}>结束练习</button>
          </div>
        </div>
      )}
    </div>
  );
}

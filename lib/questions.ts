import { qdb, udb } from "./db";
import { nowIso } from "./sm2";

/**
 * 题目访问层：卡片清洗（答题阶段不剧透答案）、筛选条件、进度行按需生成。
 * 逻辑与 server.py 保持一致。
 */

export type QuestionRow = {
  id: number;
  qid: string;
  module: string;
  category: string;
  kadian: string;
  region: string;
  year: string;
  paper: string;
  ask_model: string;
  reasoning: string;
  fastest: string;
  pitfalls: string;
  mother: string;
  stem: string;
  options: string; // JSON string
  answer: string;
  analysis: string;
  material: string;
  material_ref: string;
  doubt: string;
  related: string;
  img_refs: string;
  has_image: number;
  path: string;
};

export type Option = {
  key: string;
  label: string;
  html: string;
  is_answer?: boolean;
};

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
  note_updated?: string;
  fav?: number;
  doubt_status?: string;
  srs_wrong?: number;
  verified?: unknown;
  // 蒸馏版考库新增：所属考点的母题抽象/核心立场（来自 kaodian 表）
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

// ---------- 答案泄露打码 ----------
const ANS_LEAK_PATTERNS = [
  /正确答案[是为：: ]*[A-F](?!\s*项)/g,
  /本题(的)?答案[是为：: ]*[A-F]/g,
  /答案选[是为：: ]*[A-F]/g,
  /应选[择：: ]*[A-F]/g,
  /应当?选[择：: ]*[A-F]/g,
  /因此?选[是为：: ]*[A-F]/g,
  /故(而)?选[是为：: ]*[A-F]/g,
];

const LEAK_CALLOUT = /^[ \t]*>[^\n]*(?:\n[ \t]*>[^\n]*)*/gm;
const LEAK_BLOCKQUOTE = /<blockquote\b[\s\S]*?<\/blockquote>/gi;
const LEAK_LINE =
  /(官方解析|疑点|待人工复核|人工复核|不影响\s*(正确)?答案|不影响结论|不影响本题|与答案\s*[：:]?\s*[A-F]|答案\s*[：:]?\s*[A-F]\s*(无误|一致|不受影响)|以\s*[A-F]\s*作答为准|解析笔误|应为笔误|结论\s*无误)/;

function maskAnswerLeak(text: string): string {
  if (!text) return text;
  let s = text;
  for (const p of ANS_LEAK_PATTERNS) s = s.replace(p, "【答案已隐藏】");
  return s;
}

export function stripLeakBlocks(text: string): string {
  if (!text) return text;
  let s = text.replace(LEAK_BLOCKQUOTE, "");
  s = s.replace(LEAK_CALLOUT, "");
  const out: string[] = [];
  for (const line of s.split("\n")) {
    const plain = line.replace(/<[^>]+>/g, "");
    if (
      plain.trim() &&
      !/<img|<p>|<\/p>/i.test(line) &&
      LEAK_LINE.test(plain)
    ) {
      continue;
    }
    out.push(line);
  }
  s = out.join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function safeMaterial(text: string, mask = true): string {
  if (!text) return text;
  const s = stripLeakBlocks(text);
  return mask ? maskAnswerLeak(s) : s;
}

export function buildWhere(module?: string, category?: string, kadian?: string): { sql: string; args: unknown[] } {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (module) {
    cond.push("q.module=?");
    args.push(module);
  }
  if (category) {
    cond.push("q.category=?");
    args.push(category);
  }
  if (kadian) {
    cond.push("q.kadian LIKE ?");
    args.push("%" + kadian + "%");
  }
  return { sql: cond.length ? " AND " + cond.join(" AND ") : "", args };
}

function parseOptions(json: string): Option[] {
  try {
    return JSON.parse(json || "[]");
  } catch {
    return [];
  }
}

// ---------- 考点元信息（kaodian 表，蒸馏 Vault 的 20-考点） ----------
export type KadianMeta = {
  name: string;
  module: string;
  category: string;
  qcount: number;
  regions: number;
  years: string;
  stances: string[];
};

export function getKadianMetaByQid(qid: string): KadianMeta | null {
  if (!qid) return null;
  const r = qdb()
    .prepare(
      // kaodian.qids 为真题反链聚合（与 questions.qid 100% 对应）
      "SELECT module,category,name,qcount,regions,years,stances FROM kaodian WHERE (','||qids||',') LIKE ('%,'||?||',%') ORDER BY qcount DESC LIMIT 1"
    )
    .get(qid) as
    | { module: string; category: string; name: string; qcount: number; regions: number; years: string; stances: string }
    | undefined;
  if (!r) return null;
  return rowToMeta(r);
}

function rowToMeta(r: {
  module: string; category: string; name: string; qcount: number; regions: number; years: string; stances: string;
}): KadianMeta {
  let stances: string[] = [];
  try {
    stances = JSON.parse(r.stances || "[]");
  } catch {
    /* ignore */
  }
  return {
    name: r.name,
    module: r.module,
    category: r.category,
    qcount: r.qcount,
    regions: r.regions,
    years: r.years,
    stances,
  };
}

export function cleanCard(row: QuestionRow, reveal: boolean, uid?: string): Card {
  const d: Card = {
    id: row.id,
    qid: row.qid,
    module: row.module,
    category: row.category,
    kadian: row.kadian,
    region: row.region,
    year: row.year,
    paper: row.paper,
    ask_model: row.ask_model,
    stem: reveal ? row.stem : maskAnswerLeak(row.stem),
    options: parseOptions(row.options),
    // 多选题判据：正确答案含 2 个及以上选项字母（如 "ABD"、"ABCD"）；答题阶段也返回，供前端多选交互
    is_multi: (row.answer || "").toUpperCase().replace(/[^A-F]/g, "").length > 1,
    material: reveal ? row.material : safeMaterial(row.material),
    material_ref: row.material_ref,
  };
  if (!reveal) {
    d.options = d.options.map((o) => ({ ...o, is_answer: false }));
  } else {
    d.answer = row.answer;
    d.reasoning = row.reasoning;
    d.fastest = row.fastest;
    d.pitfalls = row.pitfalls;
    d.mother = row.mother;
    d.analysis = row.analysis;
    d.doubt = row.doubt;
    d.related = row.related;
    if (uid) {
      const ud = udb();
      const nt = ud.prepare("SELECT text,updated FROM notes WHERE qid=? AND user_id=?").get(row.qid, uid) as
        | { text: string; updated: string }
        | undefined;
      d.note = nt?.text ?? "";
      d.note_updated = nt?.updated ?? "";
      const fav = ud.prepare("SELECT qid FROM favorites WHERE qid=? AND user_id=?").get(row.qid, uid);
      d.fav = fav ? 1 : 0;
      const ds = ud.prepare("SELECT status FROM doubt_status WHERE qid=? AND user_id=?").get(row.qid, uid) as
        | { status: string }
        | undefined;
      d.doubt_status = ds?.status ?? "";
      const sr = ud.prepare("SELECT wrong FROM srs WHERE qid=? AND user_id=?").get(row.qid, uid) as
        | { wrong: number }
        | undefined;
      d.srs_wrong = sr?.wrong ?? 0;
    }
  }
  // review_verified（官方核实记录；蒸馏版新库无此表，容错跳过）
  let vr: Record<string, unknown> | undefined;
  try {
    vr = qdb().prepare("SELECT * FROM review_verified WHERE qid=?").get(row.qid) as
      | Record<string, unknown>
      | undefined;
  } catch {
    vr = undefined; // 表不存在
  }
  d.verified = vr
    ? !reveal
      ? { status: vr.status }
      : {
          status: vr.status,
          answer: vr.verified_answer,
          supplement: vr.supplement,
          source_name: vr.source_name,
          source_url: vr.source_url,
          reasoning: vr.reasoning,
        }
    : null;
  // 所属考点的母题抽象（仅揭晓后带出，答题阶段不剧透方法论）；走 qid 反链关联
  d.kadian_meta = reveal ? getKadianMetaByQid(row.qid) : null;
  return d;
}

/** 确保指定 qid 有进度行（抽到的题补齐 srs 空白记录） */
export function ensureSrsRows(uid: string, qids: string[]): void {
  if (!qids.length) return;
  const db = udb();
  const ins = db.prepare(
    "INSERT OR IGNORE INTO srs(qid,user_id,status,ease,interval,repetitions,lapses) VALUES(?,?,'new',2.5,0,0,0)"
  );
  const tx = db.transaction((list: string[]) => {
    for (const q of list) ins.run(q, uid);
  });
  tx(qids);
}

export function qTotal(): number {
  const r = qdb().prepare("SELECT COUNT(*) n FROM questions").get() as { n: number };
  return r.n;
}
export { nowIso };

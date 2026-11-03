import { NextRequest } from "next/server";
import { json, wrap } from "@/lib/api";
import { qdb } from "@/lib/db";
import { stripLeakBlocks } from "@/lib/questions";

// GET /api/materials?size&q —— 资料分析材料列表（读蒸馏 Vault 的 15-材料 表）
// 每篇材料含完整正文（结构拆解/阅读陷阱），并按 material_ref 关联题库小题
export const GET = wrap<unknown>(async (req: NextRequest) => {
  const g = req.nextUrl.searchParams;
  const size = Math.max(1, Math.min(200, parseInt(g.get("size") || "50", 10) || 50));
  const conds: string[] = [];
  const args: unknown[] = [];
  if (g.get("q")) {
    conds.push("(m.title LIKE ? OR m.theme LIKE ?)");
    const kw = "%" + g.get("q") + "%";
    args.push(kw, kw);
  }
  const where = conds.length ? " AND " + conds.join(" AND ") : "";
  const rows = qdb()
    .prepare(
      // questions.material_ref 形如 "257856 标题片段"，取前缀数字与 materials.mid 关联
      `SELECT m.mid, m.title, m.theme, m.qcount, m.body,
              (SELECT COUNT(*) FROM questions q
                WHERE q.module='资料分析' AND q.material_ref!=''
                  AND CAST(substr(q.material_ref,1,instr(q.material_ref||' ',' ')-1) AS INTEGER)=m.mid) q_linked,
              (SELECT MIN(q.id) FROM questions q
                WHERE q.module='资料分析' AND q.material_ref!=''
                  AND CAST(substr(q.material_ref,1,instr(q.material_ref||' ',' ')-1) AS INTEGER)=m.mid) rep_id
       FROM materials m WHERE 1=1${where}
       ORDER BY m.qcount DESC LIMIT ?`
    )
    .all(...args, size) as {
    mid: string; title: string; theme: string; qcount: number; body: string; q_linked: number; rep_id: number | null;
  }[];
  const out = rows.map((r) => ({
    ref: r.mid,
    title: r.title,
    theme: r.theme,
    qcount: r.qcount,
    q_linked: r.q_linked,
    rep_id: r.rep_id,
    snippet: stripLeakBlocks(r.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90),
  }));
  return json({ rows: out });
});

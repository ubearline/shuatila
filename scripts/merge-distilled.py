#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
蒸馏字段回填：把 kaogongzhentizhengliu（蒸馏 Vault）中 10-真题 的深度标注
（问法模型/推理链/最快解法/易错点/母题抽象/考点）按 qid 回填进 data/kaogong.db 的
questions 表。qid 匹配不上的题保持原样（原始库解析值），不删除任何数据。

仅标准库。运行:  python3 scripts/merge-distilled.py [--dry-run]
"""
import os, re, sys, sqlite3, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
VAULT_ROOT = os.environ.get("KAOGONG_VAULT") or os.path.join(
    ROOT, ".cache", "upstream", "kaogongzhentizhengliu")
DB_PATH = os.path.join(ROOT, "data", "kaogong.db")
DRY = "--dry-run" in sys.argv

IMG_RE = re.compile(r"(?:\.\./)+90-图片/")
WEBP_EXT_RE = re.compile(r"(/90-图片/[^\s\"' )<>]+?)\.(?:png|jpe?g)", re.IGNORECASE)


def norm_html(text):
    if not text:
        return ""
    text = IMG_RE.sub("/90-图片/", text)
    text = WEBP_EXT_RE.sub(r"\1.webp", text)
    return text


def clean_wiki(text):
    if not text:
        return ""
    text = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    return text.strip()


def frontmatter(raw):
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, re.S)
    fm = {}
    if not m:
        return fm, raw
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            v = v.strip().strip('"').strip("'")
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip() for x in v[1:-1].split(",") if x.strip()]
            fm[k.strip()] = v
    return fm, raw[m.end():]


def extract_section(body, title, level="##"):
    """抓取 `## 标题` 到下一个同级/更高级标题之间的内容"""
    pat = re.compile(
        r"^" + re.escape(level) + r"\s*" + re.escape(title) + r"\s*$\n(.*?)(?=^#{2,3}\s|\Z)",
        re.M | re.S)
    m = pat.search(body)
    return m.group(1).strip() if m else ""


def bold_field(body, label):
    m = re.search(r"\*\*" + re.escape(label) + r"\*\*[：:]\s*(.+)$", body, re.M)
    return m.group(1).strip() if m else ""


def main():
    if not os.path.isdir(VAULT_ROOT):
        print("[ERR] 找不到蒸馏 Vault:", VAULT_ROOT)
        sys.exit(1)
    q_dir = os.path.join(VAULT_ROOT, "10-真题")
    if not os.path.isdir(q_dir):
        print("[ERR] 蒸馏 Vault 缺少 10-真题 目录")
        sys.exit(1)

    files = []
    for root, _, ns in os.walk(q_dir):
        for n in ns:
            if n.endswith(".md"):
                files.append(os.path.join(root, n))
    print(f"[INFO] 蒸馏真题文件: {len(files)}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    db_qids = {r[0] for r in cur.execute("SELECT qid FROM questions")}
    print(f"[INFO] 题库 qid 数: {len(db_qids)}")

    stats = collections.Counter()
    updates = []   # (ask_model, reasoning, fastest, pitfalls, mother, kadian, qid)
    t0 = time.time()
    for fp in files:
        try:
            raw = open(fp, "r", encoding="utf-8", errors="replace").read()
        except Exception:
            stats["read_err"] += 1
            continue
        fm, body = frontmatter(raw)
        qid = str(fm.get("qid", "") or "")
        if not qid:
            # 文件名兜底：`16070200 加强论证-….md`
            m = re.match(r"^(\d{6,10})\s", os.path.basename(fp))
            qid = m.group(1) if m else ""
        if not qid:
            stats["no_qid"] += 1
            continue
        stats["vault_total"] += 1
        if qid not in db_qids:
            stats["qid_miss"] += 1
            continue
        stats["qid_hit"] += 1

        kadian = fm.get("考点", "")
        if isinstance(kadian, list):
            kadian = " ".join(kadian)
        ask_model = bold_field(body, "问法模型")
        reasoning = extract_section(body, "推理链", "##")
        fastest = bold_field(body, "最快解法")
        pitfalls = extract_section(body, "易错点", "##")
        mother = extract_section(body, "母题抽象", "##")

        def c(x):
            return norm_html(clean_wiki(x)) if x else ""

        updates.append((c(ask_model), c(reasoning), c(fastest), c(pitfalls), c(mother),
                        c(kadian) or "", qid))

    print(f"[INFO] 解析完成: {time.time()-t0:.1f}s, 统计: {dict(stats)}")

    if DRY:
        # 不落库，只统计命中题有多少字段非空
        filled = collections.Counter()
        for am, rs, fs, pt, mo, kd, _ in updates:
            for name, v in (("ask_model", am), ("reasoning", rs), ("fastest", fs),
                            ("pitfalls", pt), ("mother", mo), ("kadian", kd)):
                if v:
                    filled[name] += 1
        print("[DRY] 命中 qid:", len(updates))
        for k, v in filled.items():
            print(f"  {k}: {v} 题有值")
        conn.close()
        return

    cur.executemany(
        """UPDATE questions SET
             ask_model=CASE WHEN ?!='' THEN ? ELSE ask_model END,
             reasoning=CASE WHEN ?!='' THEN ? ELSE reasoning END,
             fastest=CASE WHEN ?!='' THEN ? ELSE fastest END,
             pitfalls=CASE WHEN ?!='' THEN ? ELSE pitfalls END,
             mother=CASE WHEN ?!='' THEN ? ELSE mother END,
             kadian=CASE WHEN ?!='' THEN ? ELSE kadian END
           WHERE qid=?""",
        [(am, am, rs, rs, fs, fs, pt, pt, mo, mo, kd, kd, qid)
         for am, rs, fs, pt, mo, kd, qid in updates])
    conn.commit()

    # 验证
    for col in ("ask_model", "reasoning", "fastest", "pitfalls", "mother", "kadian"):
        n = cur.execute(f"SELECT COUNT(*) FROM questions WHERE {col}!=''").fetchone()[0]
        print(f"  库内 {col} 非空: {n}")
    total = cur.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    print(f"[OK] 回填完成: 更新 {len(updates)} 题, 全库 {total} 题, 用时 {time.time()-t0:.1f}s")
    conn.close()


if __name__ == "__main__":
    main()

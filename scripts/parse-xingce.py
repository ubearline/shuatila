#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
原始题库（ERRRC/xingcezhenti，一卷一文件）-> SQLite 导入器

上游结构：0N-模块/<试卷名>.md（frontmatter: 试卷/地区/年份/模块），卷内
  "## 材料 N"（资料分析等模块的共享材料，html 块）
  "##|### 第 N 题　<sub>qid 123 · 子分类</sub>"，题干/选项/答案/官方解析依次排列。

处理规则：
  - 按 qid 去重：联考同题多卷收录（58,890 题行 -> ~27.5k 唯一题）；
    重复收录时合并 paper/region 信息（separate with ;）
  - 材料：qid 首次出现所在卷的材料文本存入该题 material 字段
  - 图片路径 ../90-图片/ -> /90-图片/，png/jpg -> .webp（与 img2webp.py 图库一致）

仅标准库。运行:  python3 scripts/parse-xingce.py [--fresh]
"""
import os, re, sys, json, sqlite3, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
VAULT_ROOT = os.environ.get("KAOGONG_VAULT") or os.path.join(
    ROOT, ".cache", "upstream", "xingcezhenti")
DB_PATH = os.path.join(ROOT, "data", "kaogong.db")
FRESH = (os.environ.get("KAOGONG_FRESH") == "1") or ("--fresh" in sys.argv)

IMG_RE = re.compile(r"(?:\.\./)+90-图片/")
WEBP_EXT_RE = re.compile(r"(/90-图片/[^\s\"' )<>]+?)\.(?:png|jpe?g)", re.IGNORECASE)
HEAD_RE = re.compile(r"^(#{2,3}) (材料 \d+|第 \d+ 题)(?:　<sub>qid (\d+)(?: · ([^<·]+))?</sub>)?", re.M)
OPT_RE = re.compile(r"^- \*\*([A-H])\*\*[.、．]\s*(.*)$", re.M)
ANS_RE = re.compile(r"\*\*答案\*\*[：:]\s*([A-H]{1,6})")

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

def build_schema(conn):
    cur = conn.cursor()
    if FRESH:
        for t in ("questions", "materials", "papers"):
            cur.execute("DROP TABLE IF EXISTS " + t)
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS questions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qid TEXT UNIQUE,
        module TEXT, category TEXT, kadian TEXT,
        region TEXT, year TEXT, paper TEXT,
        ask_model TEXT, reasoning TEXT, fastest TEXT, pitfalls TEXT, mother TEXT,
        stem TEXT, options TEXT, answer TEXT, analysis TEXT, material TEXT,
        material_ref TEXT, doubt TEXT, related TEXT, img_refs TEXT, has_image INT,
        path TEXT
    );
    CREATE TABLE IF NOT EXISTS materials(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mid TEXT UNIQUE, title TEXT, body TEXT, path TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_mod ON questions(module,category);
    CREATE INDEX IF NOT EXISTS ix_kd ON questions(kadian);
    """)
    conn.commit()

def parse_options(block):
    """选项行 -> [{key,label,html,is_answer}]"""
    opts = []
    for m in OPT_RE.finditer(block):
        key, raw = m.group(1), m.group(2).strip()
        is_ans = "✅" in raw
        html = raw.replace("✅", "").strip()
        plain = re.sub(r"<[^>]+>", "", html)
        plain = re.sub(r"\s+", " ", plain).strip()
        opts.append({"key": key, "label": plain, "html": norm_html(html), "is_answer": bool(is_ans)})
    return opts

def main():
    if not os.path.isdir(VAULT_ROOT):
        print("[ERR] 找不到原始题库:", VAULT_ROOT)
        sys.exit(1)
    t0 = time.time()
    conn = sqlite3.connect(DB_PATH)
    build_schema(conn)
    cur = conn.cursor()

    files = sorted(
        os.path.join(d, n)
        for d, _, ns in os.walk(VAULT_ROOT)
        for n in ns
        if n.endswith(".md") and re.match(r"^0\d", os.path.relpath(os.path.join(d, n), VAULT_ROOT))
    )
    print("[INFO] 待解析试卷:", len(files))

    rows = {}   # qid -> row（dict，合并重复卷）
    n_rows = n_skip = 0
    cur_mat = ""       # 当前材料文本
    cur_mat_id = ""    # 材料 id（卷名+编号）

    for fp in files:
        rel = os.path.relpath(fp, VAULT_ROOT).replace("\\", "/")
        try:
            raw = open(fp, "r", encoding="utf-8", errors="replace").read()
        except Exception:
            n_skip += 1
            continue
        fm = {}
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, re.S)
        if m:
            for line in m.group(1).splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    fm[k.strip()] = v.strip().strip('"').strip("'")
            raw = raw[m.end():]
        paper = fm.get("试卷", "") or os.path.basename(fp)[:-3]
        region = fm.get("地区", "")
        year = str(fm.get("年份", ""))
        module = fm.get("模块", "") or rel.split("/")[0][3:]

        # 切分小节：材料 / 题目
        heads = list(HEAD_RE.finditer(raw))
        cur_mat = ""
        cur_mat_id = ""
        for idx, h in enumerate(heads):
            end = heads[idx + 1].start() if idx + 1 < len(heads) else len(raw)
            seg = raw[h.end():end]
            if h.group(2).startswith("材料"):
                cur_mat = norm_html(clean_wiki(seg.strip()))
                cur_mat_id = f"{paper}#{h.group(2)}"
                continue
            qid = h.group(3)
            if not qid:
                n_skip += 1
                continue
            sub = (h.group(4) or "").strip()
            opts = parse_options(seg)
            am = ANS_RE.search(seg)
            answer = am.group(1) if am else ""
            # 解析：答案行之后、"官方解析"标题后的内容到小节结束
            analysis = ""
            pm = re.search(r"\*\*官方解析\*\*\s*\n+", seg[am.end():] if am else seg)
            if pm:
                tail = (seg[am.end():] if am else seg)[pm.end():]
                analysis = clean_wiki(tail).strip()
            # 题干：小节开头到第一个选项行
            om = OPT_RE.search(seg)
            stem = norm_html(clean_wiki(seg[:om.start()]).strip()) if om else ""
            stem = re.sub(r"\*\*答案\*\*[\s\S]*$", "", stem).strip()
            imgs = ",".join(dict.fromkeys(re.findall(r"/90-图片/[^\s\"' ,<>]+", stem + "\n" + cur_mat + "\n" + analysis)))[:2000]
            papers_new = f"{paper}（{region} {year}）" if region else paper
            if qid in rows:
                r = rows[qid]
                if papers_new not in r["paper"]:
                    r["paper"] = (r["paper"] + ";" + papers_new)[:1000]
                    r["region"] = ";".join(dict.fromkeys((r["region"] + ";" + region).split(";")))[:200]
                if cur_mat and not r["material"]:
                    r["material"] = cur_mat
                    r["material_ref"] = cur_mat_id
                continue
            rows[qid] = {
                "qid": qid, "module": module, "category": sub, "kadian": sub,
                "region": region, "year": year, "paper": papers_new,
                "stem": stem, "options": json.dumps(opts, ensure_ascii=False),
                "answer": answer, "analysis": analysis,
                "material": cur_mat, "material_ref": cur_mat_id,
                "imgs": imgs, "path": rel,
            }
        n_rows += 1
        if n_rows % 300 == 0:
            print(f"  ... {n_rows} 卷, {len(rows)} 题, {time.time()-t0:.1f}s")

    out = [(
        r["qid"], r["module"], r["category"], r["kadian"], r["region"], r["year"], r["paper"],
        "", "", "", "",  # ask_model/reasoning/fastest/pitfalls：原始库无蒸馏标注
        "",  # mother
        r["stem"], r["options"], r["answer"], r["analysis"], r["material"], r["material_ref"],
        "", "",  # doubt, related
        r["imgs"], 1 if r["imgs"] else 0, r["path"],
    ) for r in rows.values()]
    cur.executemany("""INSERT OR REPLACE INTO questions
        (qid,module,category,kadian,region,year,paper,ask_model,reasoning,fastest,
         pitfalls,mother,stem,options,answer,analysis,material,material_ref,doubt,related,
         img_refs,has_image,path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", out)
    conn.commit()
    total = cur.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    noans = cur.execute("SELECT COUNT(*) FROM questions WHERE answer=''").fetchone()[0]
    print(f"[OK] 导入完成: {total} 题（来自 {n_rows} 卷）, 无答案 {noans}, 用时 {time.time()-t0:.1f}s")
    conn.execute("VACUUM")
    conn.close()
    print("[FILE]", DB_PATH)

if __name__ == "__main__":
    main()

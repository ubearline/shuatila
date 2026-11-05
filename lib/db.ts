import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { todayStr, nowIso } from "./sm2";

/**
 * 数据库层：
 *  - kaogong.db  只读题库（27,506 题），随镜像/仓库提供，可只读打开
 *  - users.db    用户数据（账号 / srs / reviews / notes / favorites / exam_history）
 *                路径可用环境变量覆盖，Docker 中挂载到持久卷
 */

export const DATA_DIR =
  process.env.DATA_DIR || path.join(process.cwd(), "data");
export const QDB_PATH =
  process.env.KAOGONG_DB_PATH || path.join(DATA_DIR, "kaogong.db");
export const UDB_PATH =
  process.env.USERS_DB_PATH || path.join(DATA_DIR, "users.db");
export const IMAGES_DIR =
  process.env.IMAGES_DIR || path.join(DATA_DIR, "images");

export function resolveQid(qidInt: number): string | null {
  const r = qdb()
    .prepare("SELECT qid FROM questions WHERE id=?")
    .get(qidInt) as { qid: string } | undefined;
  return r ? r.qid : null;
}

// ---------- 连接单例（规避 dev 热重载重复建连） ----------
declare global {
  // eslint-disable-next-line no-var
  var __kaogong_qdb: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var __kaogong_udb: Database.Database | undefined;
}

export function qdb(): Database.Database {
  if (!global.__kaogong_qdb) {
    if (!fs.existsSync(QDB_PATH)) {
      throw new Error(
        `题库库不存在: ${QDB_PATH}。请先运行 npm run db:assemble（合并分卷），或设置 KAOGONG_DB_PATH。`
      );
    }
    // 只读连接：不能 set journal_mode（会写库头），单进程只读无需 WAL
    global.__kaogong_qdb = new Database(QDB_PATH, { readonly: true });
    attachUdb(global.__kaogong_qdb);
  }
  return global.__kaogong_qdb;
}

/**
 * 题库库与用户库是两个独立 SQLite 文件，跨库 JOIN 需用 ATTACH：
 * 把用户库附加为 `users`，路由 SQL 里以 `users.srs` / `users.favorites` /
 * `users.doubt_status` 前缀跨库查询。
 */
function attachUdb(db: Database.Database): void {
  // 确保用户库文件存在（首次运行可能尚无，先建表，避免 ATTACH 失败）
  if (!fs.existsSync(UDB_PATH)) {
    fs.mkdirSync(path.dirname(UDB_PATH), { recursive: true });
    const t = new Database(UDB_PATH);
    t.pragma("journal_mode = WAL");
    ensureTables(t);
    t.close();
  }
  db.exec(`ATTACH DATABASE '${UDB_PATH.replace(/\\/g, "/")}' AS users`);
}

export function udb(): Database.Database {
  if (!global.__kaogong_udb) {
    fs.mkdirSync(path.dirname(UDB_PATH), { recursive: true });
    global.__kaogong_udb = new Database(UDB_PATH);
    global.__kaogong_udb.pragma("journal_mode = WAL");
    global.__kaogong_udb.pragma("busy_timeout = 5000");
    ensureTables(global.__kaogong_udb);
  }
  return global.__kaogong_udb;
}

// ---------- 用户库表结构（与既有 users.db 活跃模型一致） ----------
export function ensureTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY,
      name TEXT,
      created TEXT,
      username TEXT,
      pw_hash TEXT,
      token TEXT,
      anon INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auth_tokens(
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tokens_user ON auth_tokens(user_id);
    CREATE TABLE IF NOT EXISTS srs(
      qid TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      ease REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      due TEXT,
      last_review TEXT,
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0,
      wb_status TEXT DEFAULT 'active',
      wb_streak INTEGER DEFAULT 0,
      last_choice TEXT,
      PRIMARY KEY(qid, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_srs_user ON srs(user_id);
    CREATE TABLE IF NOT EXISTS reviews(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qid TEXT, user_id TEXT, grade INT, ts TEXT,
      interval_before INT, interval_after INT, ease REAL, timeout INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
    CREATE TABLE IF NOT EXISTS notes(
      qid TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT, updated TEXT,
      PRIMARY KEY(qid, user_id)
    );
    CREATE TABLE IF NOT EXISTS favorites(
      qid TEXT NOT NULL, user_id TEXT NOT NULL, added TEXT,
      PRIMARY KEY(qid, user_id)
    );
    CREATE TABLE IF NOT EXISTS doubt_status(
      qid TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT, note TEXT, updated TEXT,
      PRIMARY KEY(qid, user_id)
    );
    CREATE TABLE IF NOT EXISTS exam_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, total INT, correct INT, score REAL, duration INT, ts TEXT, user_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_exam_user ON exam_history(user_id);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  `);
  // 旧库迁移：users 表补 device_id 列（游客设备绑定）
  try {
    db.prepare("ALTER TABLE users ADD COLUMN device_id TEXT").run();
  } catch {
    /* 列已存在 */
  }
  if (!db.prepare("SELECT value FROM settings WHERE key='daily_goal'").get()) {
    db.prepare("INSERT INTO settings(key,value) VALUES('daily_goal','20')").run();
  }
}

// ---------- 工具 ----------
export function newId(): string {
  return "u" + crypto.randomBytes(8).toString("hex");
}
export { todayStr, nowIso };

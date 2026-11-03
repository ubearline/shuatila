import crypto from "node:crypto";
import { udb, newId } from "./db";
import { nowIso } from "./sm2";

/**
 * 认证：PBKDF2-HMAC-SHA256 加盐哈希 + 随机 token。
 * pw_hash 存储格式：<salt_hex>$<iterations>$<dk_hex>（与既有 users.db 兼容）。
 */

const ITER = 200000;

/**
 * 部署注册开关：环境变量 ALLOW_REGISTER，默认允许（保持现状）。
 * 取值 0 / false / off / no / disabled（不区分大小写）视为禁用注册；其余或未设置视为允许。
 * 禁用后：/api/auth/register 与游客升级 /api/auth/upgrade 均返回 403；游客匿名模式不受影响。
 */
export function isRegisterAllowed(): boolean {
  const v = (process.env.ALLOW_REGISTER || "").trim().toLowerCase();
  if (!v) return true;
  return !["0", "false", "off", "no", "disabled"].includes(v);
}

export function pwHash(pw: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(pw, salt, ITER, 32, "sha256");
  return `${salt.toString("hex")}$${ITER}$${dk.toString("hex")}`;
}

export function pwVerify(pw: string, stored: string): boolean {
  const [saltHex, itStr, dkHex] = stored.split("$");
  if (!saltHex || !itStr || !dkHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const it = parseInt(itStr, 10);
  const dk = crypto.pbkdf2Sync(pw, salt, it, 32, "sha256");
  const a = Buffer.from(dkHex, "hex");
  const b = dk;
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function newToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function authUid(token?: string | null): string | null {
  const tok = (token || "").trim();
  if (!tok) return null;
  const r = udb()
    .prepare("SELECT id FROM users WHERE token=? AND IFNULL(token,'')<>''")
    .get(tok) as { id: string } | undefined;
  return r ? r.id : null;
}

export function needUid(token?: string | null): string {
  const uid = authUid(token);
  if (!uid) throw new UnauthorizedError();
  return uid;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("未登录或登录已失效");
    this.name = "UnauthorizedError";
  }
}

/** 创建游客（匿名）账号 */
export function createGuestAccount(): {
  id: string;
  name: string;
  token: string;
} {
  const id = newId();
  const token = newToken();
  const name = `游客_${id.slice(1, 7)}`;
  const created = nowIso();
  udb()
    .prepare(
      "INSERT INTO users(id,name,created,username,pw_hash,token,anon) VALUES(?,?,?,?,?,?,1)"
    )
    .run(id, name, created, null, null, token);
  return { id, name, token };
}

/** 创建正式账号（用户名 + 密码） */
export function createAccount(
  username: string,
  pw: string
): { id: string; name: string; token: string } {
  const id = newId();
  const token = newToken();
  const created = nowIso();
  udb()
    .prepare(
      "INSERT INTO users(id,name,created,username,pw_hash,token,anon) VALUES(?,?,?,?,?,?,0)"
    )
    .run(id, username, created, username, pwHash(pw), token);
  return { id, name: username, token };
}

export function loginAccount(
  username: string,
  pw: string
): { id: string; name: string; token: string } | null {
  const u = udb()
    .prepare("SELECT * FROM users WHERE username=? AND IFNULL(anon,0)=0")
    .get(username) as
    | { id: string; name: string; pw_hash: string }
    | undefined;
  if (!u || !u.pw_hash || !pwVerify(pw, u.pw_hash)) return null;
  const token = newToken();
  udb().prepare("UPDATE users SET token=? WHERE id=?").run(token, u.id);
  return { id: u.id, name: u.name, token };
}

/** 游客升级为正式账号（绑定用户名密码，数据不丢） */
export function upgradeAccount(
  uid: string,
  username: string,
  pw: string
): { token: string } {
  const token = newToken();
  udb()
    .prepare("UPDATE users SET username=?, pw_hash=?, token=?, anon=0 WHERE id=?")
    .run(username, pwHash(pw), token, uid);
  return { token };
}

export function logout(uid: string): void {
  udb().prepare("UPDATE users SET token='' WHERE id=?").run(uid);
}

/** 游客退出 = 销毁账号及其数据 */
export function destroyAccount(uid: string): void {
  const db = udb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM srs WHERE user_id=?").run(uid);
    db.prepare("DELETE FROM reviews WHERE user_id=?").run(uid);
    db.prepare("DELETE FROM notes WHERE user_id=?").run(uid);
    db.prepare("DELETE FROM favorites WHERE user_id=?").run(uid);
    db.prepare("DELETE FROM doubt_status WHERE user_id=?").run(uid);
    db.prepare("DELETE FROM exam_history WHERE user_id=?").run(uid);
    db.prepare("DELETE FROM users WHERE id=?").run(uid);
  });
  tx();
}

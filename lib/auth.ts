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
  const db = udb();
  // 多会话：tokens 表每个登录端一行（手机/电脑可同时在线，互不踢）
  const r = db
    .prepare("SELECT user_id AS id FROM auth_tokens WHERE token=?")
    .get(tok) as { id: string } | undefined;
  if (r) return r.id;
  // 兼容旧数据：users.token 里存的最后一个 token 仍然有效
  const legacy = db
    .prepare("SELECT id FROM users WHERE token=? AND IFNULL(token,'')<>''")
    .get(tok) as { id: string } | undefined;
  return legacy ? legacy.id : null;
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

/** 签发一个新会话 token（多端同时在线：每个端一行，互不影响） */
export function issueToken(uid: string): string {
  const token = newToken();
  udb()
    .prepare(
      `INSERT INTO auth_tokens(token, user_id, created)
       VALUES(?,?,?)
       ON CONFLICT(token) DO NOTHING`
    )
    .run(token, uid, nowIso());
  return token;
}

/** 登出：只撤销当前端的会话，不影响其他已登录设备 */
export function logout(uid: string, token?: string | null): void {
  const tok = (token || "").trim();
  if (tok) {
    udb().prepare("DELETE FROM auth_tokens WHERE token=?").run(tok);
    return;
  }
  // 无 token（历史调用）退化为清 users.token
  udb().prepare("UPDATE users SET token='' WHERE id=?").run(uid);
}

/** 撤销某用户除 keepToken 外的全部会话（保留当前端） */
export function revokeOtherSessions(uid: string, keepToken?: string | null): void {
  const keep = (keepToken || "").trim();
  if (keep) {
    udb().prepare("DELETE FROM auth_tokens WHERE user_id=? AND token<>?").run(uid, keep);
    udb().prepare("UPDATE users SET token='' WHERE id=? AND token<>?").run(uid, keep);
  } else {
    udb().prepare("DELETE FROM auth_tokens WHERE user_id=?").run(uid);
    udb().prepare("UPDATE users SET token='' WHERE id=?").run(uid);
  }
}

/**
 * 创建/复用游客账号（设备绑定）：
 * 同一 deviceId 重复进入游客模式时复用同一账号与进度，不重复注册。
 */
export function getOrCreateGuest(deviceId: string): {
  id: string;
  name: string;
  token: string;
  created: boolean;
} {
  const db = udb();
  const gid = `g_${deviceId}`;
  const existing = db
    .prepare("SELECT id, name FROM users WHERE id=?")
    .get(gid) as { id: string; name: string } | undefined;
  if (existing) {
    const token = issueToken(existing.id);
    return { id: existing.id, name: existing.name, token, created: false };
  }
  const token = newToken();
  const name = `游客_${deviceId.slice(0, 6)}`;
  const created = nowIso();
  db.prepare(
    "INSERT INTO users(id,name,created,username,pw_hash,token,anon,device_id) VALUES(?,?,?,?,?,?,1,?)"
  ).run(gid, name, created, null, null, token, deviceId);
  return { id: gid, name, token, created: true };
}

/** 创建正式账号（用户名 + 密码） */
export function createAccount(
  username: string,
  pw: string
): { id: string; name: string; token: string } {
  const id = newId();
  const created = nowIso();
  udb()
    .prepare(
      "INSERT INTO users(id,name,created,username,pw_hash,token,anon) VALUES(?,?,?,?,?,'',0)"
    )
    .run(id, username, created, username, pwHash(pw));
  const token = issueToken(id);
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
  // 多端在线：签发新会话，不覆盖旧端 token
  return { id: u.id, name: u.name, token: issueToken(u.id) };
}

/** 游客升级为正式账号（绑定用户名密码，数据不丢） */
export function upgradeAccount(
  uid: string,
  username: string,
  pw: string,
  currentToken?: string | null
): { token: string } {
  udb()
    .prepare("UPDATE users SET username=?, pw_hash=?, anon=0, token='' WHERE id=?")
    .run(username, pwHash(pw), uid);
  // 保留当前端的会话（已认证为该 uid），撤销其他残留
  revokeOtherSessions(uid, currentToken);
  return { token: currentToken || issueToken(uid) };
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

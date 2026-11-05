"use client";

/**
 * 前端 API 客户端：token 持久化到 localStorage，统一封装 fetch。
 */
const TOKEN_KEY = "kg_token";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 设备 ID：localStorage 里的稳定随机 UUID，用于游客模式设备绑定——
 * 同一浏览器每次进游客模式都复用同一个游客账号。
 * localStorage 被清则视为新设备（游客数据无法找回，属预期）。
 */
const DEVICE_KEY = "kg_device_id";
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; params?: Record<string, string | undefined> } = {}
): Promise<T> {
  let url = path;
  const sp = new URLSearchParams();
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== "") sp.set(k, v);
    }
  }
  const qs = sp.toString();
  if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { method: opts.method || "GET", headers, body, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error || `请求失败 (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const auth = async (path: string) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ ok: boolean; token: string; name: string; error?: string }>(path, {
        method: "POST",
        body: { username, password },
      });
      setToken(r.token);
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ ok: boolean; token: string }>("/api/auth/guest", { method: "POST" });
      setToken(r.token);
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <div className="card" style={{ width: 340 }}>
        <img src="/logo.png" className="login-logo" alt="刷题啦" />
        <h1 className="login-title">刷题啦</h1>
        <p className="muted" style={{ textAlign: "center" }}>
          行测真题 · SM-2 间隔重复
        </p>
        <div className="row" style={{ justifyContent: "center", marginBottom: 14 }}>
          <button className={mode === "login" ? "primary" : ""} onClick={() => setMode("login")}>
            登录
          </button>
          <button className={mode === "register" ? "primary" : ""} onClick={() => setMode("register")}>
            注册
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input
            placeholder="密码（≥6位）"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <div className="error">{err}</div>}
          <button
            className="primary"
            disabled={busy}
            onClick={() => auth(mode === "login" ? "/api/auth/login" : "/api/auth/register")}
          >
            {busy ? "请稍候…" : mode === "login" ? "登录" : "注册"}
          </button>
          <button disabled={busy} onClick={guest}>
            免注册游客模式
          </button>
        </div>
      </div>
    </div>
  );
}

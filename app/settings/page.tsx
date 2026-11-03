"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, setToken } from "@/lib/client";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; name: string; anon?: boolean } | null>(null);
  const [goal, setGoal] = useState(20);
  const [upUser, setUpUser] = useState("");
  const [upPw, setUpPw] = useState("");
  const [msg, setMsg] = useState("");
  const [allowRegister, setAllowRegister] = useState(true);

  useEffect(() => {
    api<{ ok: boolean; id: string; name: string; anon?: boolean }>("/api/auth/me").then((r) => {
      if (r.ok) setMe({ id: r.id, name: r.name, anon: r.anon });
    });
    api<{ goal: number }>("/api/streak").then((r) => setGoal(r.goal)).catch(() => {});
    api<{ allowRegister: boolean }>("/api/config")
      .then((r) => setAllowRegister(r.allowRegister !== false))
      .catch(() => {});
  }, []);

  const saveGoal = async () => {
    await api("/api/goal", { method: "POST", body: { value: goal } });
    setMsg("已保存每日目标");
  };
  const upgrade = async () => {
    try {
      const r = await api<{ ok: boolean; token: string; error?: string }>("/api/auth/upgrade", {
        method: "POST",
        body: { username: upUser, password: upPw },
      });
      setToken(r.token);
      setMe({ ...me!, anon: false });
      setMsg("升级成功，数据已保留");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const delAccount = async () => {
    // 游客销毁数据
    await api("/api/auth/destroy", { method: "POST" });
    clearToken();
    router.replace("/login");
  };

  return (
    <div>
      <h1>设置</h1>
      <div className="card" style={{ maxWidth: 520 }}>
        <h2>账号</h2>
        <div className="muted">用户名：{me?.name}</div>
        {me?.anon && allowRegister && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">当前为游客模式，绑定用户名密码可升级为正式账号（数据不丢）：</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input placeholder="用户名" value={upUser} onChange={(e) => setUpUser(e.target.value)} />
              <input placeholder="密码（≥6位）" type="password" value={upPw} onChange={(e) => setUpPw(e.target.value)} />
              <button onClick={upgrade} className="primary">升级为正式账号</button>
            </div>
          </div>
        )}

        <h2>每日目标</h2>
        <div className="row">
          <input type="number" min={1} max={500} value={goal} onChange={(e) => setGoal(Number(e.target.value) || 20)} style={{ width: 80 }} />
          <button onClick={saveGoal}>保存</button>
        </div>

        {me?.anon && (
          <>
            <h2>数据</h2>
            <button onClick={delAccount} style={{ background: "#3f1d1d", color: "#fca5a5" }}>
              退出并销毁游客数据
            </button>
          </>
        )}
        {msg && <div className="info" style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  );
}

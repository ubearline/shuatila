"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "@/lib/client";

const NAV = [
  { href: "/", label: "总览" },
  { href: "/study", label: "开始练习" },
  { href: "/browse", label: "真题浏览" },
  { href: "/kadian", label: "考点导航" },
  { href: "/materials", label: "材料组题" },
  { href: "/doubts", label: "疑点复核" },
  { href: "/exam", label: "模拟考试" },
  { href: "/stats", label: "数据统计" },
  { href: "/settings", label: "设置" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<{ ok: boolean; name: string; anon?: boolean }>("/api/auth/me");
        if (me.ok) {
          setAuthed(true);
          setUserName(me.name);
        } else {
          clearToken();
        }
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, [pathname]);

  // 路由切换时收起移动端抽屉
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // 未登录 → 登录页
  // 注意：游客登录后 setToken 会先写入 token 再跳转首页，此时 loading/authed 仍为旧值，
  // 若仅凭 !loading && !authed 判断会误跳 /login。因此必须同时确认“确实没有 token”才跳转。
  useEffect(() => {
    if (authed || pathname === "/login") return;
    if (loading) return; // 鉴权校验中，不跳转
    if (!getToken()) {
      router.replace("/login");
    }
  }, [loading, authed, pathname, router]);

  if (loading) {
    return <div className="center-page">加载中…</div>;
  }
  if (!authed) {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="hamburger"
          aria-label="打开菜单"
          onClick={() => setNavOpen((v) => !v)}
        >
          ☰
        </button>
        <span className="topbar-title">刷题啦</span>
      </header>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="brand">
          <img src="/brand-icon.png" className="brand-logo" alt="刷题啦" />
          <span>刷题啦</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={pathname === n.href ? "active" : ""}
              onClick={() => setNavOpen(false)}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="user">
          <span title={userName}>{userName}</span>
          <button
            onClick={async () => {
              try {
                await api("/api/auth/logout", { method: "POST" });
              } catch {}
              clearToken();
              router.replace("/login");
            }}
          >
            退出
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

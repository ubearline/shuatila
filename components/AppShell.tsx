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

  // 未登录 → 登录页
  useEffect(() => {
    if (!loading && !authed && pathname !== "/login") {
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
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand-icon.png" className="brand-logo" alt="刷题啦" />
          <span>刷题啦</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? "active" : ""}>
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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AudioLines,
  BookOpenText,
  CalendarDays,
  FileType2,
  FolderOpen,
  GraduationCap,
  Home,
  ListChecks,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { useViewMode } from "@/components/view-mode-provider";

const NAV = [
  { href: "/home", label: "Главная", short: "Главная", icon: Home },
  { href: "/files", label: "Файлы", short: "Файлы", icon: FolderOpen },
  { href: "/notes", label: "Конспекты", short: "Конспекты", icon: NotebookPen },
  { href: "/diary", label: "Дневник", short: "Дневник", icon: CalendarDays },
  { href: "/teachers", label: "Преподаватели", short: "Препод.", icon: GraduationCap },
  { href: "/quiz", label: "Тесты", short: "Тесты", icon: ListChecks },
  { href: "/md2pdf", label: "MD2PDF", short: "MD2PDF", icon: FileType2 },
  { href: "/speech", label: "Озвучка", short: "Озвучка", icon: AudioLines },
  { href: "/settings", label: "Настройки", short: "Настройки", icon: Settings },
];

/**
 * На телефоне в нижней панели помещается 5 пунктов с читаемыми подписями.
 * Первые четыре — самые частые разделы, остальные уходят в меню «Ещё».
 */
const MOBILE_PRIMARY = ["/home", "/files", "/notes", "/diary"];

export default function AppShell({
  user,
  children,
}: {
  user: { username: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode } = useViewMode();
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      // Обои (слой 35%)
      fetch("/api/wallpaper")
        .then((r) => (r.ok && r.status !== 204 ? r.blob() : null))
        .then((b) => {
          if (!alive) return;
          if (b && b.size > 0) setWallpaper(`/api/wallpaper?t=${Date.now()}`);
          else setWallpaper(null);
        })
        .catch(() => undefined);


    };
    check();
    window.addEventListener("kk-wallpaper-changed", check);
    return () => {
      alive = false;
      window.removeEventListener("kk-wallpaper-changed", check);
    };
  }, [pathname]);

  // Меню «Ещё» закрывается по клику вне его области и по Escape.
  // Сами ссылки закрывают его непосредственно через onClick.
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isMobile = mode === "mobile";
  const primary = NAV.filter((item) => MOBILE_PRIMARY.includes(item.href));
  const secondary = NAV.filter((item) => !MOBILE_PRIMARY.includes(item.href));
  const secondaryActive = secondary.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {wallpaper && (
        <div
          className="wallpaper-layer"
          style={{ backgroundImage: `url(${wallpaper})` }}
          aria-hidden="true"
        />
      )}

      {/* Десктоп: плавающая панель снизу, у Steam — полоса сверху */}
      {!isMobile && (
        <aside className="side">
          <Link href="/home" className="side-brand">
            <BookOpenText size={20} style={{ color: "var(--accent)" }} />
            <span
              className="font-extrabold tracking-tight text-[13px]"
              style={{ color: "var(--text)" }}
            >
              KAGURA<span style={{ color: "var(--accent)" }}>•</span>KONSPEKT
            </span>
          </Link>

          <nav className="side-nav">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${active ? " active" : ""}`}
                  title={item.label}
                >
                  <item.icon size={17} />
                  <span className="nav-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="side-user">
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
              }}
              title={user.role === "admin" ? "Администратор" : "Пользователь"}
            >
              {user.role === "admin" ? (
                <ShieldCheck size={15} style={{ color: "var(--accent)" }} />
              ) : (
                <User size={15} style={{ color: "var(--accent)" }} />
              )}
            </span>
            <span className="text-xs font-bold">{user.username}</span>
            <button onClick={logout} className="btn btn-icon btn-ghost" title="Выйти">
              <LogOut size={15} />
            </button>
          </div>
        </aside>
      )}

      {/* Мобильная версия: 4 основных раздела + меню «Ещё» */}
      {isMobile && (
        <nav className="bottomnav" ref={moreRef}>
          {primary.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${active ? " active" : ""}`}
              >
                <item.icon size={20} />
                <span className="nav-label">{item.short}</span>
              </Link>
            );
          })}

          <button
            type="button"
            className={`nav-item${secondaryActive || moreOpen ? " active" : ""}`}
            onClick={() => setMoreOpen((value) => !value)}
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={20} />
            <span className="nav-label">Ещё</span>
          </button>

          {moreOpen && (
            <div className="nav-more-sheet">
              {secondary.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-more-item${active ? " active" : ""}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
              <div className="nav-more-divider" />
              <div className="nav-more-user">
                {user.role === "admin" ? (
                  <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
                ) : (
                  <User size={16} style={{ color: "var(--accent)" }} />
                )}
                <span className="text-sm font-bold flex-1 truncate">
                  {user.username}
                </span>
                <button className="btn btn-ghost !py-1.5" onClick={logout}>
                  <LogOut size={14} /> Выйти
                </button>
              </div>
            </div>
          )}
        </nav>
      )}

      <div className="main-area">{children}</div>
    </>
  );
}

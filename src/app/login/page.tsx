"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }
      router.push("/home");
      router.refresh();
    } catch {
      setError("Нет соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 anim-in">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, var(--accent2) 20%, transparent))",
              border: "1px solid var(--line)",
            }}
          >
            <BookOpenText size={38} style={{ color: "var(--accent)" }} />
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            KAGURA<span style={{ color: "var(--accent)" }}>•</span>KONSPEKT
          </h1>
          <p className="muted mt-2 text-sm">
            База данных конспектов · файлы · дневник · ИИ
          </p>
        </div>

        <form onSubmit={submit} className="panel p-7 space-y-4 anim-in anim-in-1">
          <div>
            <label className="block text-xs font-semibold mb-2 muted uppercase tracking-wider">
              Логин
            </label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Имя пользователя"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-2 muted uppercase tracking-wider">
              Пароль
            </label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div
              className="text-sm font-medium px-4 py-3 rounded-xl"
              style={{
                background: "color-mix(in srgb, #ff5470 14%, transparent)",
                color: "#ff8fa3",
                border: "1px solid color-mix(in srgb, #ff5470 30%, transparent)",
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-accent w-full"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <>
                <LogIn size={17} /> Войти
              </>
            )}
          </button>
        </form>
        <p className="text-center text-xs muted mt-6 anim-in anim-in-2">
          Локальный сервер конспектов · порт 2315
        </p>
      </div>
    </main>
  );
}

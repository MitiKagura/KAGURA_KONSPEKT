"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ImageIcon,
  KeyRound,
  Link2,
  Monitor,
  MonitorSmartphone,
  Palette,
  Smartphone,
  RefreshCw,
  ServerCog,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wallpaper,
} from "lucide-react";
import { Spinner, YesConfirm } from "@/components/ui";
import { useViewMode } from "@/components/view-mode-provider";
import { useTheme, useToast } from "@/components/providers";
import { EDITABLE_VARS, THEMES } from "@/lib/themes";

interface OllamaStatus {
  online: boolean;
  apiReady?: boolean;
  model: string;
  hasModel: boolean;
  models?: string[];
  endpoint?: string;
  version?: string;
  error?: string | null;
}
interface UserRow { id: number; username: string; role: string; createdAt: string }

function isHex(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v);
}

/**
 * Объявлен на уровне модуля намеренно. Если объявлять компонент секции внутри
 * SettingsPage, на каждом onChange меняется его тип: React размонтирует input,
 * теряет фокус и браузер перескакивает к началу страницы.
 */
function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-bold m-0 row gap-2 text-base mb-4">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

const S = SettingsSection;

export default function SettingsPage() {
  const toast = useToast();
  const { theme, setTheme, colors, setColor, clearColor, resetColors, effective } = useTheme();
  const {
    mode: viewMode,
    pinned: viewPinned,
    setMode: setViewMode,
    resetAuto: resetViewMode,
  } = useViewMode();
  const [me, setMe] = useState<{ id: number; username: string; role: string } | null>(null);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [hasWallpaper, setHasWallpaper] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  // Ссылки на внешние сервисы, открываемые в разделах MD2PDF и Озвучка
  const [md2pdfMode, setMd2pdfMode] = useState<"system" | "site">("system");
  const [md2pdfUrl, setMd2pdfUrl] = useState("");
  const [ttsUrl, setTtsUrl] = useState("");
  const [linksSaving, setLinksSaving] = useState(false);
  const [linksMsg, setLinksMsg] = useState("");
  const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});
  const wallInput = useRef<HTMLInputElement>(null);
  // пароль
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  // пользователи
  const [users, setUsers] = useState<UserRow[]>([]);
  const [nuName, setNuName] = useState("");
  const [nuPw, setNuPw] = useState("");
  const [nuRole, setNuRole] = useState("user");
  const [delUser, setDelUser] = useState<UserRow | null>(null);

  const checkWallpaper = useCallback(async () => {
    const r = await fetch("/api/wallpaper");
    setHasWallpaper(r.ok && r.status !== 204);
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/users");
    if (r.ok) setUsers((await r.json()).users);
  }, []);

  const checkOllama = useCallback(async () => {
    setOllamaLoading(true);
    try {
      const r = await fetch("/api/ai/status");
      if (r.ok) setOllama(await r.json());
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user));
    checkWallpaper();
    checkOllama();
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => {
        setMd2pdfMode(data?.settings?.md2pdfMode === "site" ? "site" : "system");
        setMd2pdfUrl(data?.settings?.md2pdfUrl || "");
        setTtsUrl(data?.settings?.ttsUrl || "");
      })
      .catch(() => undefined);
  }, [checkWallpaper, checkOllama]);

  useEffect(() => {
    if (me?.role === "admin") loadUsers();
  }, [me, loadUsers]);

  useEffect(() => {
    setColorDrafts(
      Object.fromEntries(EDITABLE_VARS.map((item) => [item.key, colors[item.key] ?? ""])),
    );
  }, [theme, colors]);

  async function uploadWallpaper(f: File) {
    const form = new FormData();
    form.set("file", f);
    const res = await fetch("/api/wallpaper", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      toast.push(data.error || "Ошибка загрузки", true);
      return;
    }
    toast.push("Обои применены — фон темы/обои = 65/35");
    window.dispatchEvent(new Event("kk-wallpaper-changed"));
    checkWallpaper();
  }

  async function removeWallpaper() {
    await fetch("/api/wallpaper", { method: "DELETE" });
    toast.push("Обои удалены");
    window.dispatchEvent(new Event("kk-wallpaper-changed"));
    setHasWallpaper(false);
  }





  async function saveLinks() {
    setLinksSaving(true);
    setLinksMsg("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ md2pdfMode, md2pdfUrl, ttsUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      setMd2pdfMode(data.settings.md2pdfMode === "site" ? "site" : "system");
      setMd2pdfUrl(data.settings.md2pdfUrl);
      setTtsUrl(data.settings.ttsUrl);
      setLinksMsg("Ссылки сохранены");
      toast.push("Ссылки сервисов обновлены");
    } catch (error) {
      setLinksMsg(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setLinksSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSyncMsg(`Готово: выгружено ${d.exported} конспект(ов) в папку «Конспекты», импортировано ${d.imported} новых из *.md файлов.`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  }

  async function changePassword() {
    setPwMsg("");
    if (!me) return;
    const r = await fetch(`/api/users/${me.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPw, currentPassword: curPw }),
    });
    const d = await r.json();
    if (!r.ok) {
      setPwMsg(d.error || "Ошибка");
      return;
    }
    setPwMsg("Пароль обновлён");
    setCurPw("");
    setNewPw("");
  }

  async function createUser() {
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: nuName.trim(), password: nuPw, role: nuRole }),
    });
    const d = await r.json();
    if (!r.ok) {
      toast.push(d.error || "Ошибка", true);
      return;
    }
    toast.push(`Пользователь ${d.user.username} создан — ему доступна личная папка /srv/KAGURA_KONSPEKT/${d.user.username}`);
    setNuName("");
    setNuPw("");
    loadUsers();
  }

  async function deleteUser() {
    if (!delUser) return;
    const r = await fetch(`/api/users/${delUser.id}`, { method: "DELETE" });
    if (!r.ok) throw new Error((await r.json()).error || "Ошибка удаления");
    setUsers((l) => l.filter((u) => u.id !== delUser.id));
    toast.push(`Пользователь ${delUser.username} удалён (его личные файлы сохранены на диске)`);
  }

  return (
    <div>
      <header className="page-hero anim-in">
        <h1 className="page-title">Настройки</h1>
        <p className="page-sub">Темы · палитра · обои · синхронизация · аккаунт</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Темы */}
        <S icon={<Palette size={18} style={{ color: "var(--accent)" }} />} title="Оформление">
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="text-left p-3.5 rounded-2xl transition-all"
                style={{
                  background:
                    theme === t.id
                      ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                      : "var(--surface2)",
                  border: `1.5px solid ${theme === t.id ? "var(--accent)" : "var(--line)"}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "var(--text)",
                }}
              >
                {/* мини-превью */}
                <div
                  className="rounded-xl p-2 mb-2.5 space-y-1"
                  style={{ background: t.vars.bg, border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex gap-1">
                    <span className="w-5 h-1.5 rounded-full" style={{ background: t.vars.accent }} />
                    <span className="w-3 h-1.5 rounded-full" style={{ background: t.vars.accent2 }} />
                  </div>
                  <div className="h-1.5 rounded-full w-4/5" style={{ background: t.vars.surface2 }} />
                  <div className="h-1.5 rounded-full w-3/5" style={{ background: t.vars.surface2 }} />
                </div>
                <div className="font-bold text-sm row gap-1.5">
                  {t.name}
                  {theme === t.id && <Check size={14} style={{ color: "var(--accent)" }} />}
                </div>
                <div className="text-[11px] muted mt-0.5 leading-snug">{t.desc}</div>
              </button>
            ))}
          </div>

          <div className="divider" />
          <div className="row justify-between mb-3">
            <div className="text-sm font-bold">Палитра (hex) — только на этом устройстве</div>
            <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => { resetColors(); toast.push("Палитра сброшена к теме"); }}>
              <RefreshCw size={13} /> Сброс
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {EDITABLE_VARS.map((v) => {
              const cur = effective[v.key] || "#000000";
              const canPick = v.key !== "surface" || effective[v.key]?.startsWith("#");
              return (
                <div key={v.key}>
                  <label className="text-[11px] font-semibold muted uppercase tracking-wider block mb-1.5">
                    {v.label}
                  </label>
                  <div className="row gap-1.5">
                    <input
                      className="input !px-2.5 font-mono !text-xs"
                      value={colorDrafts[v.key] ?? ""}
                      placeholder={cur.startsWith("#") ? cur : "auto"}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setColorDrafts((drafts) => ({ ...drafts, [v.key]: val }));
                        if (isHex(val)) setColor(v.key, val);
                        else if (val === "") clearColor(v.key);
                      }}
                      onBlur={() => {
                        const val = colorDrafts[v.key] ?? "";
                        if (val !== "" && !isHex(val)) {
                          setColorDrafts((drafts) => ({
                            ...drafts,
                            [v.key]: colors[v.key] ?? "",
                          }));
                        }
                      }}
                    />
                    <input
                      type="color"
                      className="w-9 h-9 rounded-lg shrink-0 cursor-pointer"
                      style={{ background: "var(--surface2)", border: "1px solid var(--line)", padding: 2 }}
                      value={canPick && cur.startsWith("#") ? (cur.length === 4 ? `#${cur[1]}${cur[1]}${cur[2]}${cur[2]}${cur[3]}${cur[3]}` : cur) : "#888888"}
                      disabled={!cur.startsWith("#")}
                      onChange={(e) => setColor(v.key, e.target.value)}
                      title="Выбрать цвет"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </S>

        {/* Обои */}
        <div className="space-y-4">
          <S icon={<Wallpaper size={18} style={{ color: "var(--accent2)" }} />} title="Пользовательские обои">
            <p className="text-sm muted mt-0 mb-4">
              Слой поверх темы и фонового изображения. Непрозрачность: <b>35%</b>. JPG, PNG, WebP до 15 МБ.
            </p>
            <div className="row flex-wrap gap-2">
              <button className="btn btn-accent" onClick={() => wallInput.current?.click()}>
                <Upload size={15} /> {hasWallpaper ? "Заменить обои" : "Загрузить обои"}
              </button>
              {hasWallpaper && (
                <button className="btn btn-danger" onClick={removeWallpaper}>
                  <Trash2 size={15} /> Убрать
                </button>
              )}
              <input
                ref={wallInput}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                hidden
                onChange={(e) => e.target.files?.[0] && uploadWallpaper(e.target.files[0])}
              />
            </div>
          </S>



          {/* Внешние сервисы */}
          <S icon={<Link2 size={18} style={{ color: "var(--accent)" }} />} title="Внешние сервисы">
            <p className="text-sm muted mt-0 mb-4">
              Эти адреса открываются внутри приложения в разделах <b>MD2PDF</b> и{" "}
              <b>Озвучка</b> — без перехода в новую вкладку.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                  Режим MD2PDF
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`btn ${md2pdfMode === "system" ? "btn-accent" : ""}`}
                    onClick={() => setMd2pdfMode("system")}
                  >
                    Системный
                  </button>
                  <button
                    className={`btn ${md2pdfMode === "site" ? "btn-accent" : ""}`}
                    onClick={() => setMd2pdfMode("site")}
                  >
                    Сайт
                  </button>
                </div>
                <p className="text-xs muted mt-2 mb-0">
                  {md2pdfMode === "system"
                    ? "Встроенный конвертер KAGURA: оформление выбранной темы, MathJax, Mermaid, Callouts, подсветка кода и настройка каждой таблицы."
                    : "Внешний конвертер открывается как подсайт через обратный прокси."}
                </p>
              </div>
              {md2pdfMode === "site" && (
                <div>
                  <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                    Ссылка на внешний конвертер
                  </label>
                  <input
                    className="input"
                    value={md2pdfUrl}
                    onChange={(event) => setMd2pdfUrl(event.target.value)}
                    placeholder="https://md2pdf.cc/"
                    inputMode="url"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                  Сервис озвучки
                </label>
                <input
                  className="input"
                  value={ttsUrl}
                  onChange={(event) => setTtsUrl(event.target.value)}
                  placeholder="Вставьте ссылку на сервис синтеза речи"
                  inputMode="url"
                />
              </div>
              <button className="btn btn-accent" onClick={saveLinks} disabled={linksSaving}>
                {linksSaving ? <Spinner /> : <Link2 size={15} />} Сохранить ссылки
              </button>
              {linksMsg && (
                <p
                  className="text-sm m-0"
                  style={{
                    color: linksMsg === "Ссылки сохранены" ? "var(--accent2)" : "#ff8fa3",
                  }}
                >
                  {linksMsg}
                </p>
              )}
            </div>
          </S>

          {/* Режим отображения */}
          <S icon={<MonitorSmartphone size={18} style={{ color: "var(--accent2)" }} />} title="Режим отображения">
            <p className="text-sm muted mt-0 mb-4">
              Разметка выбирается автоматически по устройству. Выбор можно закрепить —
              он сохранится и попадёт в адрес страницы как <code>?view=</code>.
            </p>
            <div className="row flex-wrap gap-2">
              <button
                className={`btn ${viewMode === "desktop" && viewPinned ? "btn-accent" : ""}`}
                onClick={() => setViewMode("desktop")}
              >
                <Monitor size={15} /> Компьютер
              </button>
              <button
                className={`btn ${viewMode === "mobile" && viewPinned ? "btn-accent" : ""}`}
                onClick={() => setViewMode("mobile")}
              >
                <Smartphone size={15} /> Телефон
              </button>
              <button className="btn btn-ghost" onClick={resetViewMode} disabled={!viewPinned}>
                <RefreshCw size={15} /> Автоматически
              </button>
            </div>
            <p className="text-xs muted mt-3 mb-0">
              Сейчас активен режим: <b>{viewMode === "mobile" ? "телефон" : "компьютер"}</b>
              {viewPinned ? " (закреплён вручную)" : " (определён автоматически)"}.
            </p>
          </S>

          {/* Синхронизация */}
          <S icon={<RefreshCw size={18} style={{ color: "var(--accent)" }} />} title="Синхронизация с папкой">
            <p className="text-sm muted mt-0 mb-4">
              Выгружает все конспекты в папку <b>Конспекты</b> вашего файлового менеджера (по предметам, *.md) и импортирует обратно новые *.md файлы — удобно править конспекты и файловым менеджером тоже.
            </p>
            <button className="btn btn-accent" onClick={sync} disabled={syncing}>
              {syncing ? <Spinner /> : <RefreshCw size={15} />}
              Синхронизировать
            </button>
            {syncMsg && <p className="text-sm mt-3 mb-0" style={{ color: "var(--accent2)" }}>{syncMsg}</p>}
          </S>

          {/* ИИ-сервер */}
          <S icon={<Bot size={18} style={{ color: "var(--accent2)" }} />} title="ИИ-сервер (Ollama)">
            <div className="row flex-wrap gap-2 mb-3">
              <span className={`chip ${ollama?.online ? "chip-accent" : ""}`}>
                <ServerCog size={13} />
                {ollama === null
                  ? "проверка…"
                  : ollama.online
                    ? `Ollama онлайн${ollama.version ? ` · v${ollama.version}` : ""}`
                    : "Ollama недоступна"}
              </span>
              {ollama && (
                <span className={`chip ${ollama.hasModel ? "chip-accent" : ""}`}>
                  {ollama.hasModel
                    ? `модель ${ollama.model} готова`
                    : `модель ${ollama.model} не найдена`}
                </span>
              )}
              <button className="btn btn-icon" onClick={checkOllama} disabled={ollamaLoading} title="Проверить снова">
                {ollamaLoading ? <Spinner size={14} /> : <RefreshCw size={14} />}
              </button>
            </div>
            {ollama?.endpoint && (
              <p className="text-xs muted mt-0 mb-2">
                Рабочий адрес API:{" "}
                <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)" }}>
                  {ollama.endpoint}
                </code>
              </p>
            )}
            {ollama?.error && (
              <div
                className="text-xs px-3 py-2 rounded-xl mb-3"
                style={{
                  color: ollama.online ? "var(--accent2)" : "#ff8fa3",
                  background: ollama.online
                    ? "color-mix(in srgb, var(--accent2) 8%, transparent)"
                    : "color-mix(in srgb, #ff5470 10%, transparent)",
                  border: `1px solid ${ollama.online ? "color-mix(in srgb, var(--accent2) 20%, transparent)" : "color-mix(in srgb, #ff5470 25%, transparent)"}`,
                }}
              >
                {ollama.error}
              </div>
            )}
            <p className="text-xs muted m-0">
              Управление сервисом:{" "}
              <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)" }}>
                systemctl status ollama
              </code>
              {" · "}Проверка API:{" "}
              <code className="px-1.5 py-0.5 rounded" style={{ background: "var(--surface2)" }}>
                curl http://127.0.0.1:11434/api/version
              </code>
              . Если второй «ollama serve» пишет address already in use — это нормально: сервер уже запущен, второй экземпляр не нужен.
            </p>
          </S>
        </div>

        {/* Аккаунт */}
        <S icon={<KeyRound size={18} style={{ color: "var(--accent)" }} />} title="Аккаунт">
          <div className="space-y-3 max-w-sm">
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Текущий пароль</label>
              <input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Новый пароль</label>
              <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            </div>
            <button className="btn btn-accent" disabled={!curPw || newPw.length < 4} onClick={changePassword}>
              Сменить пароль
            </button>
            {pwMsg && <p className="text-sm m-0" style={{ color: pwMsg === "Пароль обновлён" ? "var(--accent2)" : "#ff8fa3" }}>{pwMsg}</p>}
          </div>
        </S>

        {/* Пользователи (админ) */}
        {me?.role === "admin" && (
          <S icon={<Users size={18} style={{ color: "var(--accent)" }} />} title="Пользователи">
            <div className="space-y-1.5 mb-5">
              {users.map((u) => (
                <div key={u.id} className="panel-flat px-4 py-2.5 row gap-3">
                  {u.role === "admin" ? (
                    <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
                  ) : (
                    <ImageIcon size={16} className="muted" />
                  )}
                  <div className="flex-1">
                    <span className="font-semibold text-sm">{u.username}</span>
                    <span className="text-xs muted ml-2">
                      {u.role === "admin" ? "администратор · root-доступ к файлам" : "личная папка"}
                    </span>
                  </div>
                  {u.id !== me?.id && (
                    <button
                      className="btn btn-icon btn-ghost hover:!text-red-400"
                      title="Удалить пользователя"
                      onClick={() => setDelUser(u)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="panel-flat p-3.5 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider muted row gap-1.5">
                <UserPlus size={13} /> Новый пользователь
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_130px]">
                <input className="input" placeholder="Логин" value={nuName} onChange={(e) => setNuName(e.target.value)} />
                <input className="input" placeholder="Пароль (мин. 4 символа)" type="password" value={nuPw} onChange={(e) => setNuPw(e.target.value)} autoComplete="new-password" />
                <select className="select" value={nuRole} onChange={(e) => setNuRole(e.target.value)}>
                  <option value="user">Пользователь</option>
                  <option value="admin">Админ</option>
                </select>
              </div>
              <button className="btn btn-accent" disabled={!nuName.trim() || nuPw.length < 4} onClick={createUser}>
                <UserPlus size={15} /> Создать
              </button>
            </div>
          </S>
        )}
      </div>

      <div className="text-xs muted mt-6 row gap-2">
        <SettingsIcon size={13} />
        KAGURA•KONSPEKT · порт 2315 · PostgreSQL · файлы в /srv/KAGURA_KONSPEKT
      </div>

      <YesConfirm
        open={!!delUser}
        onClose={() => setDelUser(null)}
        title={`Удалить пользователя «${delUser?.username}»?`}
        what="Будут удалены аккаунт, его конспекты, предметы, расписание и задания. Личные файлы на диске останутся."
        onConfirm={deleteUser}
      />
    </div>
  );
}

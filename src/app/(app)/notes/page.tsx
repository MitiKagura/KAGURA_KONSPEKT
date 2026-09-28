"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Download,
  Eye,
  FilePlus2,
  ListChecks,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  Search,
  SplitSquareHorizontal,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Confirm, EmptyState, Modal, Spinner, YesConfirm } from "@/components/ui";
import { useToast } from "@/components/providers";
import { MarkdownEditor, MarkdownView } from "@/components/markdown";
import { AiPanel } from "@/components/ai-panel";

interface Subject { id: number; name: string; isDefault: boolean }
interface Note {
  id: number; subjectId: number; title: string; content: string; updatedAt: string;
}

export default function NotesPageWrapper() {
  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center py-32">
          <Spinner size={34} />
        </div>
      }
    >
      <NotesPage />
    </React.Suspense>
  );
}

function NotesPage() {
  const toast = useToast();
  const params = useSearchParams();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeSubject, setActiveSubject] = useState<number | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [view, setView] = useState<"split" | "edit" | "preview">("split");
  // Режим фокуса: прячет ленты предметов и конспектов, отдавая всё место редактору
  const [focusMode, setFocusMode] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [renameSubject, setRenameSubject] = useState<Subject | null>(null);
  const [renameSubjectVal, setRenameSubjectVal] = useState("");
  const [delSubject, setDelSubject] = useState<Subject | null>(null);
  const [delNote, setDelNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [sj, nt] = await Promise.all([
        fetch("/api/subjects").then((r) => r.json()),
        fetch("/api/notes").then((r) => r.json()),
      ]);
      setSubjects(sj.subjects || []);
      setNotes(nt.notes || []);
      setActiveSubject((cur) => cur ?? (sj.subjects?.[0]?.id ?? null));
      const openId = Number(params.get("open"));
      if (openId) {
        const target = (nt.notes || []).find((n: Note) => n.id === openId) as Note | undefined;
        if (target) {
          setActiveSubject(target.subjectId);
          openNote(target);
        }
      }
    } catch {
      toast.push("Не удалось загрузить конспекты", true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNote(n: Note) {
    if (dirty && note) {
      // авто-сохранение при переключении
      void save();
    }
    setNote(n);
    setTitle(n.title);
    setContent(n.content);
    setDirty(false);
  }

  async function save(silent = false) {
    if (!note) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotes((l) => l.map((x) => (x.id === note.id ? data.note : x)));
      setNote(data.note);
      setDirty(false);
      if (!silent) {
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1600);
      }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка сохранения", true);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(true);
        setSavedTick(true);
        setTimeout(() => setSavedTick(false), 1400);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, title, content]);

  async function createNote() {
    if (!activeSubject) {
      toast.push("Сначала создайте предмет", true);
      return;
    }
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId: activeSubject, title: "Новый конспект", content: "" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.push(data.error || "Ошибка", true);
      return;
    }
    setNotes((l) => [data.note, ...l]);
    openNote(data.note);
    setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 60);
  }

  async function addSubject() {
    const name = newSubject.trim();
    if (!name) return;
    const res = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.push(data.error || "Ошибка", true);
      return;
    }
    setSubjects((l) => [...l, data.subject]);
    setActiveSubject(data.subject.id);
    setAddSubjectOpen(false);
    setNewSubject("");
  }

  async function doRenameSubject() {
    if (!renameSubject) return;
    const res = await fetch(`/api/subjects/${renameSubject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameSubjectVal.trim() }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    setSubjects((l) => l.map((s) => (s.id === renameSubject.id ? data.subject : s)));
    setRenameSubject(null);
  }

  async function doDeleteSubject() {
    if (!delSubject) return;
    const res = await fetch(`/api/subjects/${delSubject.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Не удалось удалить предмет");
    setSubjects((l) => l.filter((s) => s.id !== delSubject.id));
    setNotes((l) => l.filter((n) => n.subjectId !== delSubject.id));
    if (note?.subjectId === delSubject.id) setNote(null);
    if (activeSubject === delSubject.id) setActiveSubject(null);
    toast.push(`Предмет «${delSubject.name}» удалён вместе с конспектами`);
  }

  async function doDeleteNote() {
    if (!delNote) return;
    const res = await fetch(`/api/notes/${delNote.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Не удалось удалить конспект");
    setNotes((l) => l.filter((n) => n.id !== delNote.id));
    if (note?.id === delNote.id) setNote(null);
  }

  function downloadNote() {
    if (!note) return;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title || "конспект"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filteredNotes = useMemo(
    () =>
      notes.filter(
        (n) =>
          (activeSubject === null || n.subjectId === activeSubject) &&
          (noteQuery.trim()
            ? n.title.toLowerCase().includes(noteQuery.toLowerCase()) ||
              n.content.toLowerCase().includes(noteQuery.toLowerCase())
            : true),
      ),
    [notes, activeSubject, noteQuery],
  );

  const activeSubjectName = subjects.find((s) => s.id === activeSubject)?.name;

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size={34} />
      </div>
    );
  }

  return (
    <div>
      <header className="page-hero anim-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Конспекты</h1>
          <p className="page-sub">Markdown-редактор · живой предпросмотр · ИИ-анализ</p>
        </div>
        <div className="row gap-2 notes-header-actions">
          <button className="btn" onClick={() => setAddSubjectOpen(true)}>
            <FilePlus2 size={15} /> Предмет
          </button>
          <button className="btn btn-accent" onClick={createNote}>
            <StickyNote size={15} /> Новый конспект
          </button>
        </div>
      </header>

      <div className={`notes-layout ${note && focusMode ? "notes-compact" : ""}`}>
        {/* Предметы */}
        <section
          className={`panel p-3 notes-col-subjects ${note ? "notes-hide-on-mobile" : ""}`}
        >
          <div className="row justify-between px-2 pb-2 pt-1">
            <span className="text-xs font-bold uppercase tracking-wider muted">
              Предметы
            </span>
            <span className="text-xs muted">{subjects.length}</span>
          </div>
          <div className="notes-subject-track">
            {subjects.map((s) => (
              <div
                key={s.id}
                className="notes-item row shrink-0 rounded-xl transition-colors"
                style={{
                  background:
                    activeSubject === s.id
                      ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                      : "transparent",
                }}
              >
                <button
                  onClick={() => setActiveSubject(s.id)}
                  className="flex-1 text-left px-3.5 py-2.5 text-sm font-semibold truncate"
                  style={{
                    color: activeSubject === s.id ? "var(--accent)" : "var(--text)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {s.name}
                  <span className="muted font-normal text-xs ml-2">
                    {notes.filter((n) => n.subjectId === s.id).length}
                  </span>
                </button>
                <button
                  className="btn btn-icon btn-ghost !p-1.5 notes-hover-action notes-touch-btn"
                  title="Переименовать"
                  onClick={() => {
                    setRenameSubject(s);
                    setRenameSubjectVal(s.name);
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="btn btn-icon btn-ghost !p-1.5 notes-touch-btn hover:!text-red-400"
                  title="Удалить предмет"
                  onClick={() => setDelSubject(s)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              className="btn btn-ghost text-sm !justify-start shrink-0"
              onClick={() => setAddSubjectOpen(true)}
            >
              + Добавить предмет
            </button>
          </div>
        </section>

        {/* Список конспектов */}
        <section className={`panel p-3 notes-col-list ${note ? "notes-hide-on-mobile" : ""}`}>
          <div className="row gap-2 px-1 pb-2">
            <Search size={14} className="muted shrink-0" />
            <input
              className="input !border-0 !bg-transparent !p-1 text-sm"
              style={{ boxShadow: "none" }}
              placeholder="Поиск по конспектам…"
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
            />
            {noteQuery && (
              <button className="btn btn-icon btn-ghost !p-1" onClick={() => setNoteQuery("")}>
                <X size={13} />
              </button>
            )}
          </div>
          {filteredNotes.length === 0 ? (
            <div className="empty !py-8 text-sm">
              {noteQuery ? "Не найдено" : "Конспектов нет"}
            </div>
          ) : (
            <div className="notes-list-scroll">
              {filteredNotes.map((n) => (
                <div
                  key={n.id}
                  className="row notes-item notes-list-item rounded-xl"
                  style={{
                    background:
                      note?.id === n.id
                        ? "color-mix(in srgb, var(--accent) 13%, transparent)"
                        : "transparent",
                  }}
                >
                  <button
                    onClick={() => openNote(n)}
                    className="flex-1 text-left px-3.5 py-3 min-w-0"
                    style={{
                      background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: note?.id === n.id ? "var(--accent)" : "var(--text)" }}
                    >
                      {n.title}
                    </div>
                    <div className="text-[11px] muted truncate mt-0.5">
                      {n.content.replace(/[#*`>\-\n]/g, " ").trim().slice(0, 60) || "Пустой конспект"}
                    </div>
                    <div className="text-[10px] muted mt-1">
                      {new Date(n.updatedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </button>
                  <button
                    className="btn btn-icon btn-ghost !p-1.5 mr-1 notes-touch-btn hover:!text-red-400"
                    title="Удалить конспект"
                    onClick={() => setDelNote(n)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Редактор */}
        <section className="notes-col-editor">
          {!note ? (
            <div className="panel">
              <EmptyState
                icon={<StickyNote size={36} />}
                title="Выберите конспект или создайте новый"
                hint={activeSubjectName ? `Предмет: ${activeSubjectName}` : "Выберите предмет выше"}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Крупная строка названия */}
              <div className="row gap-2">
                <button
                  className="btn btn-icon notes-back-btn shrink-0"
                  onClick={() => setNote(null)}
                  title="К списку"
                >
                  <ArrowLeft size={17} />
                </button>
                <input
                  ref={titleRef}
                  className="title-input flex-1"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Название конспекта…"
                />
              </div>

              {/* Панель действий */}
              <div className="panel px-3.5 py-2.5 row flex-wrap gap-1.5">
                <button
                  className="btn btn-accent"
                  onClick={() => save()}
                  disabled={saving || !dirty}
                >
                  {saving ? <Spinner /> : <Save size={15} />}
                  {dirty ? "Сохранить" : savedTick ? "Сохранено ✓" : "Сохранено"}
                </button>
                <button className="btn btn-accent" style={{ background: "linear-gradient(135deg, var(--accent2), color-mix(in srgb, var(--accent2) 60%, var(--accent)))", color: "var(--bg)" }} onClick={() => setAiOpen(true)}>
                  <Bot size={15} /> ИИ-анализ
                </button>
                <Link
                  href="/quiz"
                  className="btn"
                  title="Пройти тест по конспектам — отдельный раздел"
                >
                  <ListChecks size={15} /> Тест
                </Link>
                <button className="btn" onClick={downloadNote} title="Скачать как .md">
                  <Download size={15} /> .md
                </button>
                <button
                  className={`btn ${focusMode ? "btn-accent" : ""}`}
                  onClick={() => setFocusMode((v) => !v)}
                  title={
                    focusMode
                      ? "Показать списки предметов и конспектов"
                      : "Скрыть списки — максимум места редактору"
                  }
                >
                  {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  <span className="max-sm:hidden">{focusMode ? "Развернуть" : "Фокус"}</span>
                </button>
                <span className="flex-1" />
                <div className="row gap-0.5 panel-flat !rounded-xl p-1">
                  <button
                    className={`btn btn-icon ${view === "edit" ? "btn-accent" : "btn-ghost"}`}
                    title="Только редактор"
                    onClick={() => setView("edit")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className={`btn btn-icon notes-split-toggle ${view === "split" ? "btn-accent" : "btn-ghost"}`}
                    title="Редактор + превью"
                    onClick={() => setView("split")}
                  >
                    <SplitSquareHorizontal size={14} />
                  </button>
                  <button
                    className={`btn btn-icon ${view === "preview" ? "btn-accent" : "btn-ghost"}`}
                    title="Только просмотр"
                    onClick={() => setView("preview")}
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>

              {/* Редактор / превью */}
              <div className={`notes-editor-grid ${view === "split" ? "is-split" : ""}`}>
                {(view === "edit" || view === "split") && (
                  <MarkdownEditor
                    value={content}
                    onChange={(v) => {
                      setContent(v);
                      setDirty(true);
                    }}
                    minHeight={440}
                  />
                )}
                {(view === "preview" || view === "split") && (
                  <div
                    className={`panel p-5 notes-preview-pane ${
                      view === "split" ? "notes-split-preview" : ""
                    }`}
                    style={{ minHeight: 440 }}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider muted mb-3">
                      Предпросмотр
                    </div>
                    {content.trim() ? (
                      <MarkdownView source={content} />
                    ) : (
                      <span className="muted text-sm">Начните писать — здесь сразу появится готовый вид</span>
                    )}
                  </div>
                )}
              </div>
              {dirty && (
                <div className="text-xs muted">Есть несохранённые изменения · Ctrl+S — сохранить</div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Модалки */}
      <Modal open={addSubjectOpen} onClose={() => setAddSubjectOpen(false)} title="Новый предмет">
        <input
          className="input"
          placeholder="Например: Физика…"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSubject()}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="btn" onClick={() => setAddSubjectOpen(false)}>Отмена</button>
          <button className="btn btn-accent" onClick={addSubject} disabled={!newSubject.trim()}>
            Создать
          </button>
        </div>
      </Modal>

      <Modal open={!!renameSubject} onClose={() => setRenameSubject(null)} title="Переименовать предмет">
        <input
          className="input"
          value={renameSubjectVal}
          onChange={(e) => setRenameSubjectVal(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              try { await doRenameSubject(); } catch (err) { toast.push(err instanceof Error ? err.message : "Ошибка", true); }
            }
          }}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="btn" onClick={() => setRenameSubject(null)}>Отмена</button>
          <button
            className="btn btn-accent"
            disabled={!renameSubjectVal.trim()}
            onClick={async () => {
              try { await doRenameSubject(); } catch (err) { toast.push(err instanceof Error ? err.message : "Ошибка", true); }
            }}
          >
            Сохранить
          </button>
        </div>
      </Modal>

      <YesConfirm
        open={!!delSubject}
        onClose={() => setDelSubject(null)}
        title={`Удалить предмет «${delSubject?.name}»?`}
        what={`Вместе с предметом будут удалены все его конспекты (${delSubject ? notes.filter((n) => n.subjectId === delSubject.id).length : 0} шт.).`}
        onConfirm={doDeleteSubject}
      />

      <Confirm
        open={!!delNote}
        onClose={() => setDelNote(null)}
        title="Удалить конспект?"
        what={`«${delNote?.title}» будет удалён безвозвратно.`}
        onConfirm={doDeleteNote}
      />

      <AiPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        noteId={note?.id ?? null}
        noteTitle={note?.title}
        initialText={content}
      />
    </div>
  );
}

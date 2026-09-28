"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSign,
  DoorClosed,
  GraduationCap,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Confirm, EmptyState, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";

interface Teacher {
  id: number;
  subject: string;
  name: string;
  room: string;
  phone: string;
  email: string;
  messenger: string;
  note: string;
}

interface Pair { id: number; subject: string }
interface Subject { id: number; name: string }

type FormState = Omit<Teacher, "id">;

const EMPTY: FormState = {
  subject: "",
  name: "",
  room: "",
  phone: "",
  email: "",
  messenger: "",
  note: "",
};

export default function TeachersPage() {
  const toast = useToast();
  const [list, setList] = useState<Teacher[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [delTeacher, setDelTeacher] = useState<Teacher | null>(null);

  const load = useCallback(async () => {
    try {
      const [tc, sch, sj] = await Promise.all([
        fetch("/api/teachers").then((r) => r.json()),
        fetch("/api/schedule").then((r) => r.json()),
        fetch("/api/subjects").then((r) => r.json()),
      ]);
      setList(tc.teachers || []);
      setPairs(sch.pairs || []);
      setSubjects(sj.subjects || []);
    } catch {
      toast.push("Не удалось загрузить преподавателей", true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Подсказки предметов: пары из расписания + разделы конспектов, но вписать
  // можно что угодно — список не ограничивает ввод.
  const subjectHints = useMemo(() => {
    const set = new Set<string>();
    pairs.forEach((p) => set.add(p.subject));
    subjects.forEach((s) => set.add(s.name));
    list.forEach((t) => set.add(t.subject));
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [pairs, subjects, list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) =>
      [t.subject, t.name, t.room, t.phone, t.email, t.messenger, t.note]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [list, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(t: Teacher) {
    setEditing(t);
    setForm({
      subject: t.subject,
      name: t.name,
      room: t.room,
      phone: t.phone,
      email: t.email,
      messenger: t.messenger,
      note: t.note,
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.subject.trim() || !form.name.trim()) {
      toast.push("Укажите предмет и преподавателя", true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/teachers/${editing.id}` : "/api/teachers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка сохранения");
      if (editing) {
        setList((l) => l.map((t) => (t.id === editing.id ? data.teacher : t)));
        toast.push("Данные преподавателя обновлены");
      } else {
        setList((l) => [...l, data.teacher]);
        toast.push("Преподаватель добавлен");
      }
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка", true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!delTeacher) return;
    const res = await fetch(`/api/teachers/${delTeacher.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Не удалось удалить запись");
    setList((l) => l.filter((t) => t.id !== delTeacher.id));
    toast.push(`Запись «${delTeacher.name}» удалена`);
  }

  const field = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

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
          <h1 className="page-title">Преподаватели</h1>
          <p className="page-sub">
            Кто ведёт предмет, в каком кабинете и как связаться
          </p>
        </div>
        <button className="btn btn-accent" onClick={openCreate}>
          <Plus size={15} /> Добавить преподавателя
        </button>
      </header>

      <div className="panel p-4 mb-4 anim-in anim-in-1">
        <div className="row gap-2">
          <Search size={17} className="muted shrink-0" />
          <input
            className="input !border-0 !bg-transparent !p-1.5"
            style={{ boxShadow: "none" }}
            placeholder="Поиск по предмету, преподавателю, кабинету…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="btn btn-icon btn-ghost" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          )}
          <span className="chip chip-accent">{filtered.length}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={36} />}
          title={query ? "Ничего не найдено" : "Список пока пуст"}
          hint={
            query
              ? "Попробуйте изменить запрос"
              : "Добавьте предмет, преподавателя и кабинет — контакты указывать не обязательно"
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 anim-in anim-in-2">
          {filtered.map((t) => (
            <section key={t.id} className="card p-5">
              <div className="row justify-between gap-2 mb-3">
                <span className="chip chip-accent">{t.subject}</span>
                <div className="row gap-0.5">
                  <button
                    className="btn btn-icon btn-ghost"
                    title="Изменить"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn btn-icon btn-ghost hover:!text-red-400"
                    title="Удалить"
                    onClick={() => setDelTeacher(t)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="row gap-2.5 mb-3">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  <UserRound size={19} />
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-sm leading-snug break-words">{t.name}</div>
                  {t.room && (
                    <div className="text-xs muted row gap-1 mt-0.5">
                      <DoorClosed size={12} /> кабинет {t.room}
                    </div>
                  )}
                </div>
              </div>

              {(t.phone || t.email || t.messenger || t.note) && (
                <div className="panel-flat p-3 space-y-1.5 text-sm">
                  {t.phone && (
                    <a className="row gap-2 no-underline" style={{ color: "var(--text)" }} href={`tel:${t.phone}`}>
                      <Phone size={13} style={{ color: "var(--accent2)" }} />
                      <span className="truncate">{t.phone}</span>
                    </a>
                  )}
                  {t.email && (
                    <a className="row gap-2 no-underline" style={{ color: "var(--text)" }} href={`mailto:${t.email}`}>
                      <AtSign size={13} style={{ color: "var(--accent2)" }} />
                      <span className="truncate">{t.email}</span>
                    </a>
                  )}
                  {t.messenger && (
                    <div className="row gap-2">
                      <MessageCircle size={13} style={{ color: "var(--accent2)" }} />
                      <span className="truncate">{t.messenger}</span>
                    </div>
                  )}
                  {t.note && (
                    <div className="row gap-2 items-start">
                      <StickyNote size={13} style={{ color: "var(--accent2)", marginTop: 3 }} />
                      <span className="muted break-words">{t.note}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Изменить: ${editing.name}` : "Новый преподаватель"}
      >
        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Предмет *
            </label>
            <input
              className="input"
              list="teacher-subject-hints"
              placeholder="Например: Математика"
              value={form.subject}
              onChange={(e) => field("subject", e.target.value)}
              autoFocus
            />
            <datalist id="teacher-subject-hints">
              {subjectHints.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Преподаватель *
            </label>
            <input
              className="input"
              placeholder="Фамилия Имя Отчество"
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Кабинет
            </label>
            <input
              className="input"
              placeholder="Например: 312 или 2 корпус, 45"
              value={form.room}
              onChange={(e) => field("room", e.target.value)}
            />
          </div>

          <div className="divider !my-2" />
          <div className="text-xs font-bold uppercase tracking-wider muted">
            Контакты — опционально
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                Телефон
              </label>
              <input
                className="input"
                placeholder="+7…"
                value={form.phone}
                onChange={(e) => field("phone", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                Почта
              </label>
              <input
                className="input"
                placeholder="mail@example.com"
                value={form.email}
                onChange={(e) => field("email", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Мессенджер
            </label>
            <input
              className="input"
              placeholder="Telegram / VK / другое"
              value={form.messenger}
              onChange={(e) => field("messenger", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Заметка
            </label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="Часы консультаций, требования, любые пометки…"
              value={form.note}
              onChange={(e) => field("note", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button className="btn" onClick={() => setFormOpen(false)} disabled={saving}>
              Отмена
            </button>
            <button
              className="btn btn-accent"
              onClick={save}
              disabled={saving || !form.subject.trim() || !form.name.trim()}
            >
              {saving ? <Spinner /> : editing ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </div>
      </Modal>

      <Confirm
        open={!!delTeacher}
        onClose={() => setDelTeacher(null)}
        title="Удалить преподавателя?"
        what={`«${delTeacher?.name}» (${delTeacher?.subject}) будет удалён из справочника.`}
        onConfirm={remove}
      />
    </div>
  );
}

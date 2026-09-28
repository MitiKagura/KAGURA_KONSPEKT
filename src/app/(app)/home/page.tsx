"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import { Spinner, EmptyState } from "@/components/ui";
import { useToast } from "@/components/providers";
import {
  DOW_NAMES,
  dowOf,
  fmtDate,
  pairActive,
  parityLabel,
  parityOfWeekFor,
} from "@/lib/dates";

interface Pair {
  id: number; dow: number; num: number; subject: string;
  timeFrom: string; timeTo: string; weekType: string;
}
interface Hw { id: number; subject: string; day: string; task: string; done: boolean }
interface Note {
  id: number; title: string; updatedAt: string; subjectId: number;
}
interface Subject { id: number; name: string }
interface TeacherRow { id: number; subject: string; name: string; room: string }

export default function HomePage() {
  const toast = useToast();
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [hw, setHw] = useState<Hw[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [parityFlip, setParityFlip] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);
  const todayStr = fmtDate(today);
  const parity = parityOfWeekFor(today, parityFlip);
  const dow = dowOf(today);

  useEffect(() => {
    (async () => {
      try {
        const [meR, schR, hwR, ntR, sjR, stR, tcR] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/schedule"),
          fetch(`/api/homework?from=${todayStr}&to=${fmtDate(new Date(Date.now() + 6 * 864e5))}`),
          fetch("/api/notes"),
          fetch("/api/subjects"),
          fetch("/api/settings"),
          fetch("/api/teachers"),
        ]);
        if (meR.ok) setMe((await meR.json()).user);
        if (schR.ok) setPairs((await schR.json()).pairs);
        if (hwR.ok) setHw((await hwR.json()).homework);
        if (ntR.ok) setNotes((await ntR.json()).notes);
        if (sjR.ok) setSubjects((await sjR.json()).subjects);
        if (stR.ok) setParityFlip(Boolean((await stR.json())?.settings?.weekParityFlip));
        if (tcR.ok) setTeachers((await tcR.json()).teachers);
      } catch {
        toast.push("Не удалось загрузить данные", true);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayPairs = pairs
    .filter((p) => p.dow === dow && pairActive(p.weekType, parity))
    .sort((a, b) => a.num - b.num);
  const todayHw = hw.filter((h) => h.day === todayStr);
  const upcoming = hw.filter((h) => h.day > todayStr && !h.done);
  const subjectName = (id: number) => subjects.find((s) => s.id === id)?.name || "—";
  const teacherFor = (subject: string) =>
    teachers.find((t) => t.subject.toLowerCase() === subject.toLowerCase());

  async function toggleHw(h: Hw) {
    setHw((list) => list.map((x) => (x.id === h.id ? { ...x, done: !x.done } : x)));
    const res = await fetch(`/api/homework/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !h.done }),
    });
    if (!res.ok) {
      setHw((list) => list.map((x) => (x.id === h.id ? { ...x, done: h.done } : x)));
      toast.push("Не удалось обновить задание", true);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size={34} />
      </div>
    );
  }

  const hour = today.getHours();
  const greet =
    hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <div>
      <header className="page-hero anim-in">
        <h1 className="page-title">
          {greet}, {me?.username}
        </h1>
        <p className="page-sub">
          {DOW_NAMES[dow]}, {today.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
          {" · "}
          {parityLabel(parity)} неделя
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Пары сегодня */}
        <section className="card p-5 anim-in anim-in-1">
          <div className="row justify-between mb-4">
            <h2 className="font-bold m-0 row gap-2 text-base">
              <CalendarDays size={18} style={{ color: "var(--accent)" }} />
              Пары сегодня
            </h2>
            <span className="chip chip-accent">{todayPairs.length}</span>
          </div>
          {todayPairs.length === 0 ? (
            <EmptyState title="Сегодня пар нет" hint="Заполните расписание в разделе «Дневник»" />
          ) : (
            <div className="space-y-2">
              {todayPairs.map((p) => (
                <div key={p.id} className="panel-flat px-4 py-3 row gap-3">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    {p.num}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.subject}</div>
                    {(p.timeFrom || p.timeTo) && (
                      <div className="text-xs muted row gap-1">
                        <Clock3 size={11} />
                        {p.timeFrom}
                        {p.timeTo ? `–${p.timeTo}` : ""}
                      </div>
                    )}
                    {(() => {
                      const t = teacherFor(p.subject);
                      if (!t) return null;
                      return (
                        <div className="text-xs muted row gap-1 truncate">
                          <GraduationCap size={11} />
                          <span className="truncate">
                            {t.name}
                            {t.room ? ` · каб. ${t.room}` : ""}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link href="/diary" className="btn btn-ghost w-full mt-3 text-sm">
            Открыть дневник <ArrowRight size={14} />
          </Link>
        </section>

        {/* Домашка */}
        <section className="card p-5 anim-in anim-in-2">
          <div className="row justify-between mb-4">
            <h2 className="font-bold m-0 row gap-2 text-base">
              <BookOpen size={18} style={{ color: "var(--accent2)" }} />
              Домашние задания
            </h2>
            <span className="chip">
              {hw.filter((h) => !h.done).length} активн.
            </span>
          </div>
          {todayHw.length === 0 && upcoming.length === 0 ? (
            <EmptyState title="Заданий нет" hint="Добавляйте задания в разделе «Дневник»" />
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-auto pr-1">
              {[...todayHw, ...upcoming].slice(0, 8).map((h) => (
                <label key={h.id} className="panel-flat px-3.5 py-2.5 row gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={h.done}
                    onChange={() => toggleHw(h)}
                  />
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${h.done ? "hw-done" : ""}`}>
                      {h.task}
                    </div>
                    <div className="text-xs muted">
                      {h.subject} · на {new Date(h.day + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          <Link href="/diary" className="btn btn-ghost w-full mt-3 text-sm">
            Все задания <ArrowRight size={14} />
          </Link>
        </section>

        {/* Витрина */}
        <section className="card p-5 anim-in anim-in-3 md:col-span-2 xl:col-span-1">
          <h2 className="font-bold m-0 row gap-2 text-base mb-4">
            <Sparkles size={18} style={{ color: "var(--accent)" }} />
            Обзор
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Конспектов", value: notes.length, icon: NotebookPen, href: "/notes" },
              { label: "Предметов", value: subjects.length, icon: BookOpen, href: "/notes" },
              { label: "Пар в неделе", value: pairs.filter((p) => pairActive(p.weekType, parity)).length, icon: CalendarDays, href: "/diary" },
              { label: "Файлы", value: "→", icon: FolderOpen, href: "/files" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="panel-flat p-4 no-underline block transition-transform hover:-translate-y-0.5">
                <s.icon size={17} style={{ color: "var(--accent)" }} />
                <div className="text-2xl font-extrabold mt-2" style={{ color: "var(--text)" }}>
                  {s.value}
                </div>
                <div className="text-xs muted">{s.label}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Последние конспекты */}
      <section className="card p-5 mt-4 anim-in anim-in-3">
        <div className="row justify-between mb-4">
          <h2 className="font-bold m-0 row gap-2 text-base">
            <FileText size={18} style={{ color: "var(--accent2)" }} />
            Недавние конспекты
          </h2>
          <Link href="/notes" className="btn btn-ghost text-sm">
            Все <ArrowRight size={14} />
          </Link>
        </div>
        {notes.length === 0 ? (
          <EmptyState
            title="Конспектов пока нет"
            hint="Создайте первый конспект в разделе «Конспекты»"
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {notes.slice(0, 6).map((n) => (
              <Link
                key={n.id}
                href={`/notes?open=${n.id}`}
                className="panel-flat p-4 no-underline block transition-all hover:-translate-y-0.5"
                style={{ border: "1px solid var(--line)" }}
              >
                <div className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>
                  {n.title}
                </div>
                <div className="text-xs muted mt-1.5">
                  {subjectName(n.subjectId)} ·{" "}
                  {new Date(n.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

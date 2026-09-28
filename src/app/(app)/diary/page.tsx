"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CalendarClock,
  DoorClosed,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { Confirm, EmptyState, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";
import {
  DOW_NAMES,
  DOW_SHORT,
  addDays,
  dowOf,
  fmtDate,
  mondayOf,
  pairActive,
  parityFlipFor,
  parityLabel,
  parityOfWeekFor,
  parseDate,
  type Parity,
} from "@/lib/dates";

interface Pair {
  id: number; dow: number; num: number; subject: string;
  timeFrom: string; timeTo: string; weekType: string;
}
interface Hw { id: number; subject: string; day: string; task: string; done: boolean }
interface Override {
  id: number; day: string; kind: string; pairId: number | null;
  subject: string; num: number; timeFrom: string; timeTo: string;
  room: string; note: string;
}
interface Subject { id: number; name: string }

export default function DiaryPage() {
  const toast = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  // Якорь чётности хранится в профиле; сама чётность считается от даты недели,
  // поэтому при переходе между неделями она чередуется автоматически.
  const [parityFlip, setParityFlip] = useState(false);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [hw, setHw] = useState<Hw[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<string>(() => fmtDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [addPairDow, setAddPairDow] = useState<number | null>(null);
  const [pairForm, setPairForm] = useState({ subject: "", num: 1, timeFrom: "", timeTo: "", weekType: "all" });
  const [delPair, setDelPair] = useState<Pair | null>(null);
  const [delHw, setDelHw] = useState<Hw | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [ovrOpen, setOvrOpen] = useState(false);
  const [ovrForm, setOvrForm] = useState({
    kind: "add", pairId: 0, subject: "", num: 1,
    timeFrom: "", timeTo: "", room: "", note: "",
  });
  const [delOvr, setDelOvr] = useState<Override | null>(null);
  const [hwSubject, setHwSubject] = useState("");
  const [hwTask, setHwTask] = useState("");

  const monday = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const todayStr = fmtDate(new Date());

  // Чётность показываемой недели: вычисляется, а не хранится вручную.
  const parity: Parity = parityOfWeekFor(monday, parityFlip);
  const currentParity: Parity = parityOfWeekFor(new Date(), parityFlip);

  /** Пользователь указывает чётность выбранной недели — дальше всё чередуется само. */
  async function applyParity(desired: Parity) {
    const flip = parityFlipFor(monday, desired);
    setParityFlip(flip);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekParityFlip: flip }),
      });
      if (!res.ok) throw new Error();
      toast.push(
        `Эта неделя — ${parityLabel(desired).toLowerCase()}. Дальше чётность чередуется автоматически.`,
      );
    } catch {
      toast.push("Не удалось сохранить чётность недели", true);
    }
  }

  const load = useCallback(async () => {
    try {
      const from = fmtDate(monday);
      const to = fmtDate(addDays(monday, 6));
      const [sch, hwR, sj, st, ovr] = await Promise.all([
        fetch("/api/schedule").then((r) => r.json()),
        fetch(`/api/homework?from=${from}&to=${to}`).then((r) => r.json()),
        fetch("/api/subjects").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
        fetch(`/api/schedule/overrides?from=${from}&to=${to}`).then((r) => r.json()),
      ]);
      setOverrides(ovr.overrides || []);
      setPairs(sch.pairs || []);
      setHw(hwR.homework || []);
      setSubjects(sj.subjects || []);
      setParityFlip(Boolean(st?.settings?.weekParityFlip));
    } catch {
      toast.push("Не удалось загрузить дневник", true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // при смене недели выбираем её понедельник, если выбранный день вне диапазона
    const inRange = weekDays.some((d) => fmtDate(d) === selected);
    if (!inRange) setSelected(fmtDate(weekDays[0]));
  }, [weekDays, selected]);

  const selectedDate = parseDate(selected);
  const selectedDow = dowOf(selectedDate);
  const dayHw = hw.filter((h) => h.day === selected);

  /** Базовое расписание дня (по чётности) */
  const basePairs = pairs
    .filter((p) => p.dow === selectedDow && pairActive(p.weekType, parity))
    .sort((a, b) => a.num - b.num);

  const dayOverrides = overrides.filter((o) => o.day === selected);

  /** Итоговое расписание дня с учётом единоразовых изменений */
  type DayItem = Pair & { override?: Override; state?: "cancelled" | "moved" | "extra" };
  const dayPairs: DayItem[] = (() => {
    const cancelled = new Set(
      dayOverrides.filter((o) => o.kind === "cancel").map((o) => o.pairId),
    );
    const moves = new Map(
      dayOverrides.filter((o) => o.kind === "move").map((o) => [o.pairId, o]),
    );
    const items: DayItem[] = basePairs.map((p) => {
      if (cancelled.has(p.id)) {
        const o = dayOverrides.find((x) => x.kind === "cancel" && x.pairId === p.id);
        return { ...p, override: o, state: "cancelled" };
      }
      const mv = moves.get(p.id);
      if (mv) {
        return {
          ...p,
          subject: mv.subject || p.subject,
          num: mv.num || p.num,
          timeFrom: mv.timeFrom || p.timeFrom,
          timeTo: mv.timeTo || p.timeTo,
          override: mv,
          state: "moved",
        };
      }
      return p;
    });
    // Дополнительные пары этого дня
    dayOverrides
      .filter((o) => o.kind === "add")
      .forEach((o) => {
        items.push({
          id: -o.id,
          dow: selectedDow,
          num: o.num,
          subject: o.subject,
          timeFrom: o.timeFrom,
          timeTo: o.timeTo,
          weekType: "all",
          override: o,
          state: "extra",
        });
      });
    return items.sort((a, b) => a.num - b.num);
  })();

  // Предметы для домашки — ТОЛЬКО пары, стоящие в этот день (без «стандартных» разделов)
  // Отменённые пары не предлагаем для домашнего задания
  const hwSubjectOptions = useMemo(
    () => [
      ...new Set(
        dayPairs.filter((p) => p.state !== "cancelled").map((p) => p.subject),
      ),
    ],
    [dayPairs],
  );

  // При смене дня/чётности выбираем первую пару дня; если выбранного предмета
  // в этот день нет — сбрасываем, чтобы нельзя было задать домашку «в никуда».
  useEffect(() => {
    setHwSubject((cur) =>
      cur && hwSubjectOptions.includes(cur) ? cur : hwSubjectOptions[0] || "",
    );
  }, [hwSubjectOptions]);

  async function addPair() {
    if (!addPairDow || !pairForm.subject.trim()) return;
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dow: addPairDow, ...pairForm, subject: pairForm.subject.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.push(data.error || "Ошибка", true);
      return;
    }
    setPairs((l) => [...l, data.pair]);
    setAddPairDow(null);
    setPairForm({ subject: "", num: 1, timeFrom: "", timeTo: "", weekType: "all" });
    toast.push("Пара добавлена");
  }

  /** Единоразовое изменение расписания на выбранный день */
  async function addOverride() {
    const body = {
      day: selected,
      kind: ovrForm.kind,
      pairId: ovrForm.pairId || null,
      subject: ovrForm.subject.trim(),
      num: ovrForm.num,
      timeFrom: ovrForm.timeFrom,
      timeTo: ovrForm.timeTo,
      room: ovrForm.room.trim(),
      note: ovrForm.note.trim(),
    };
    if ((body.kind === "cancel" || body.kind === "move") && !body.pairId) {
      toast.push("Выберите пару из расписания", true);
      return;
    }
    if (body.kind !== "cancel" && !body.subject) {
      toast.push("Укажите предмет", true);
      return;
    }
    const res = await fetch("/api/schedule/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.push(data.error || "Ошибка", true);
      return;
    }
    setOverrides((l) => [...l, data.override]);
    setOvrOpen(false);
    setOvrForm({ kind: "add", pairId: 0, subject: "", num: 1, timeFrom: "", timeTo: "", room: "", note: "" });
    toast.push("Изменение расписания сохранено");
  }

  async function deleteOverride() {
    if (!delOvr) return;
    const res = await fetch(`/api/schedule/overrides/${delOvr.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Не удалось отменить изменение");
    setOverrides((l) => l.filter((o) => o.id !== delOvr.id));
    toast.push("Изменение отменено — вернулось обычное расписание");
  }

  async function deletePair() {
    if (!delPair) return;
    const res = await fetch(`/api/schedule/${delPair.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Не удалось удалить пару");
    setPairs((l) => l.filter((p) => p.id !== delPair.id));
  }

  async function toggleHw(h: Hw) {
    setHw((l) => l.map((x) => (x.id === h.id ? { ...x, done: !x.done } : x)));
    const res = await fetch(`/api/homework/${h.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !h.done }),
    });
    if (!res.ok) {
      setHw((l) => l.map((x) => (x.id === h.id ? { ...x, done: h.done } : x)));
      toast.push("Ошибка обновления", true);
    }
  }

  async function addHw() {
    if (!hwTask.trim()) {
      toast.push("Введите текст задания", true);
      return;
    }
    if (!hwSubject.trim()) {
      toast.push("Укажите предмет задания", true);
      return;
    }
    const res = await fetch("/api/homework", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: hwSubject.trim(), task: hwTask.trim(), day: selected }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.push(data.error || "Ошибка", true);
      return;
    }
    setHw((l) => [...l, data.homework]);
    setHwTask("");
  }

  async function deleteHw() {
    if (!delHw) return;
    const res = await fetch(`/api/homework/${delHw.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Не удалось удалить задание");
    setHw((l) => l.filter((x) => x.id !== delHw.id));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size={34} />
      </div>
    );
  }

  const weekLabel = `${weekDays[0].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;

  return (
    <div>
      <header className="page-hero anim-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Дневник</h1>
          <p className="page-sub">Расписание пар · календарь · домашние задания</p>
        </div>
        {/* Управление неделей */}
        <div className="row flex-wrap gap-2">
          <button className="btn btn-icon" onClick={() => setWeekOffset((w) => w - 1)} title="Предыдущая неделя">
            <ChevronLeft size={17} />
          </button>
          <span className="chip chip-accent !text-sm !py-2">{weekLabel}</span>
          <button className="btn btn-icon" onClick={() => setWeekOffset((w) => w + 1)} title="Следующая неделя">
            <ChevronRight size={17} />
          </button>
          <button className="btn" onClick={() => setWeekOffset(0)}>
            Сегодня
          </button>
          <div className="row gap-0.5 panel-flat !rounded-full p-1">
            {(["odd", "even"] as Parity[]).map((p) => (
              <button
                key={p}
                onClick={() => applyParity(p)}
                className="btn !rounded-full !py-1.5"
                title={`Отметить показанную неделю как «${parityLabel(p).toLowerCase()}» — дальше чередование автоматическое`}
                style={
                  parity === p
                    ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "transparent" }
                    : { background: "transparent", borderColor: "transparent", color: "var(--muted)" }
                }
              >
                {parityLabel(p)}
              </button>
            ))}
          </div>
        </div>
        <p className="page-sub mt-2 row gap-2 flex-wrap">
          <span className="chip chip-accent">
            Показана: {parityLabel(parity).toLowerCase()} неделя
          </span>
          <span className="chip">
            Текущая: {parityLabel(currentParity).toLowerCase()}
          </span>
          <span>Чётность чередуется автоматически по календарю</span>
        </p>
      </header>

      {/* Календарь недели */}
      <div className="grid grid-cols-7 gap-2 mb-5 max-lg:grid-cols-1 anim-in anim-in-1">
        {/* Мобильный выбор дня */}
        <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 col-span-7">
          {weekDays.map((d, i) => {
            const ds = fmtDate(d);
            const isSel = selected === ds;
            const isToday = ds === todayStr;
            return (
              <button
                key={i}
                onClick={() => setSelected(ds)}
                className="panel-flat px-4 py-2.5 text-center shrink-0"
                style={{
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: isSel ? "1px solid var(--accent)" : "1px solid var(--line)",
                  color: isSel ? "var(--accent)" : "var(--text)",
                  background: isSel ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined,
                }}
              >
                <div className="text-[11px] muted">{DOW_SHORT[dowOf(d)]}</div>
                <div className="text-sm font-bold" style={isToday ? { color: "var(--accent2)" } : {}}>
                  {d.getDate()}
                </div>
              </button>
            );
          })}
        </div>

        {/* Десктопная сетка: 7 колонок */}
        {weekDays.map((d, i) => {
          const dow = i + 1;
          const ds = fmtDate(d);
          const isToday = ds === todayStr;
          const isSel = selected === ds;
          const dayList = pairs
            .filter((p) => p.dow === dow && pairActive(p.weekType, parity))
            .sort((a, b) => a.num - b.num);
          const hwCount = hw.filter((h) => h.day === ds && !h.done).length;
          return (
            <div
              key={i}
              className={`panel p-3 flex flex-col min-h-40 max-lg:hidden ${isSel ? "" : ""}`}
              style={{
                borderColor: isSel
                  ? "color-mix(in srgb, var(--accent) 55%, transparent)"
                  : isToday
                    ? "color-mix(in srgb, var(--accent2) 45%, transparent)"
                    : undefined,
                cursor: "pointer",
              }}
              onClick={() => setSelected(ds)}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider muted">
                  {DOW_SHORT[dow]}
                </span>
                <span
                  className="text-sm font-extrabold"
                  style={isToday ? { color: "var(--accent)" } : {}}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="space-y-1.5 flex-1">
                {dayList.map((p) => (
                  <div key={p.id} className="panel-flat px-2 py-1.5 text-xs">
                    <span
                      className="inline-block w-4 font-bold"
                      style={{ color: "var(--accent)" }}
                    >
                      {p.num}
                    </span>
                    <span className="font-semibold">{p.subject}</span>
                    {p.weekType !== "all" && (
                      <span className="chip !text-[9px] !px-1.5 !py-0 ml-1">
                        {p.weekType === "odd" ? "неч" : "чёт"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="row gap-1.5 flex-wrap mt-1.5">
                {hwCount > 0 && (
                  <span className="text-[10px]" style={{ color: "var(--accent2)" }}>
                    {hwCount} зад.
                  </span>
                )}
                {overrides.some((o) => o.day === ds) && (
                  <span className="text-[10px] row gap-0.5" style={{ color: "var(--accent)" }}>
                    <CalendarClock size={9} />
                    изм.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Пары выбранного дня */}
        <section className="card p-5 anim-in anim-in-2">
          <div className="row justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-bold m-0 row gap-2 text-base">
              <CalendarDays size={18} style={{ color: "var(--accent)" }} />
              {DOW_NAMES[selectedDow]}, {selectedDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </h2>
            <div className="row gap-2 flex-wrap">
              <button
                className="btn"
                onClick={() => {
                  setOvrForm((f) => ({
                    ...f,
                    kind: basePairs.length ? "cancel" : "add",
                    pairId: basePairs[0]?.id || 0,
                    num: (dayPairs[dayPairs.length - 1]?.num || 0) + 1,
                  }));
                  setOvrOpen(true);
                }}
                title="Единоразовое изменение только на эту дату"
              >
                <CalendarClock size={15} /> Изменение на день
              </button>
              <button
                className="btn btn-accent"
                onClick={() => setAddPairDow(selectedDow)}
              >
                <Plus size={15} /> Добавить пару
              </button>
            </div>
          </div>
          {dayPairs.length === 0 ? (
            <EmptyState
              title="Пар нет"
              hint={`Нажмите «Добавить пару» — можно указать каждую неделю или отдельно чёт/нечет (${parityLabel(parity).toLowerCase()} сейчас)`}
            />
          ) : (
            <div className="space-y-2">
              {dayPairs.map((p) => (
                <div
                  key={`${p.id}-${p.state || "base"}`}
                  className="panel-flat px-4 py-3 row gap-3 group"
                  style={
                    p.state === "cancelled"
                      ? { opacity: 0.55, borderColor: "color-mix(in srgb, #ff5470 35%, transparent)" }
                      : p.state
                        ? { borderColor: "color-mix(in srgb, var(--accent2) 45%, transparent)" }
                        : undefined
                  }
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0"
                    style={{
                      background:
                        p.state === "cancelled"
                          ? "color-mix(in srgb, #ff5470 15%, transparent)"
                          : "color-mix(in srgb, var(--accent) 15%, transparent)",
                      color: p.state === "cancelled" ? "#ff8fa3" : "var(--accent)",
                    }}
                  >
                    {p.num}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-semibold text-sm truncate"
                      style={
                        p.state === "cancelled"
                          ? { textDecoration: "line-through" }
                          : undefined
                      }
                    >
                      {p.subject}
                    </div>
                    <div className="text-xs muted row gap-2 flex-wrap">
                      {(p.timeFrom || p.timeTo) && (
                        <span className="row gap-1">
                          <Clock3 size={11} />
                          {p.timeFrom}
                          {p.timeTo ? `–${p.timeTo}` : ""}
                        </span>
                      )}
                      {p.override?.room && (
                        <span className="row gap-1">
                          <DoorClosed size={11} /> каб. {p.override.room}
                        </span>
                      )}
                      {p.state === "cancelled" && (
                        <span className="chip !text-[10px]" style={{ color: "#ff8fa3" }}>
                          отменена
                        </span>
                      )}
                      {p.state === "moved" && (
                        <span className="chip chip-accent !text-[10px]">перенос</span>
                      )}
                      {p.state === "extra" && (
                        <span className="chip chip-accent !text-[10px]">доп. пара</span>
                      )}
                      {!p.state && (
                        <span className="chip !text-[10px]">
                          {p.weekType === "all" ? "каждую неделю" : p.weekType === "odd" ? "нечётная нед." : "чётная нед."}
                        </span>
                      )}
                      {p.override?.note && (
                        <span className="truncate">· {p.override.note}</span>
                      )}
                    </div>
                  </div>
                  {p.override ? (
                    <button
                      className="btn btn-icon btn-ghost"
                      title="Отменить это изменение (вернуть обычное расписание)"
                      onClick={() => setDelOvr(p.override!)}
                    >
                      <Undo2 size={15} />
                    </button>
                  ) : (
                    <button
                      className="btn btn-icon btn-ghost hover:!text-red-400"
                      title="Удалить пару из расписания"
                      onClick={() => setDelPair(p)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Домашка выбранного дня */}
        <section className="card p-5 anim-in anim-in-3">
          <h2 className="font-bold m-0 row gap-2 text-base mb-4">
            <BookOpenCheck size={18} style={{ color: "var(--accent2)" }} />
            Домашние задания на {selectedDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </h2>

          {dayHw.length === 0 ? (
            <EmptyState title="Заданий не задано" hint="Добавьте задание ниже — предмет подтянется из пар дня" />
          ) : (
            <div className="space-y-1.5 mb-4">
              {dayHw.map((h) => (
                <div key={h.id} className="panel-flat px-3.5 py-2.5 row gap-3">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={h.done}
                    onChange={() => toggleHw(h)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${h.done ? "hw-done" : ""}`}>{h.task}</div>
                    <div className="text-xs muted">{h.subject}</div>
                  </div>
                  <button
                    className="btn btn-icon btn-ghost hover:!text-red-400"
                    onClick={() => setDelHw(h)}
                    title="Удалить задание"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Форма добавления — предметы только из пар этого дня */}
          <div className="panel-flat p-3.5 space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wider muted">
              Новое задание
            </div>
            {hwSubjectOptions.length === 0 ? (
              <div className="text-sm muted">
                На этот день пар нет — сначала добавьте пару слева, и её предмет
                появится здесь для выбора.
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                  <select
                    className="select"
                    value={hwSubject}
                    onChange={(e) => setHwSubject(e.target.value)}
                  >
                    {hwSubjectOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Текст задания: параграф, номера…"
                    value={hwTask}
                    onChange={(e) => setHwTask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHw()}
                  />
                </div>
                <button
                  className="btn btn-accent w-full"
                  onClick={addHw}
                  disabled={!hwTask.trim()}
                >
                  <Plus size={15} /> Добавить задание
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Добавить пару */}
      <Modal
        open={!!addPairDow}
        onClose={() => setAddPairDow(null)}
        title={addPairDow ? `Добавить пару · ${DOW_NAMES[addPairDow]}` : ""}
      >
        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Предмет</label>
            <input
              className="input"
              list="subjects-list"
              placeholder="Название предмета…"
              value={pairForm.subject}
              onChange={(e) => setPairForm((f) => ({ ...f, subject: e.target.value }))}
              autoFocus
            />
            <datalist id="subjects-list">
              {subjects.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">№ пары</label>
              <input
                className="input"
                type="number" min={1} max={10}
                value={pairForm.num}
                onChange={(e) => setPairForm((f) => ({ ...f, num: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Начало</label>
              <input
                className="input"
                type="time"
                value={pairForm.timeFrom}
                onChange={(e) => setPairForm((f) => ({ ...f, timeFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Конец</label>
              <input
                className="input"
                type="time"
                value={pairForm.timeTo}
                onChange={(e) => setPairForm((f) => ({ ...f, timeTo: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Чётность недели
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "all", label: "Каждую" },
                { v: "odd", label: "Нечёт" },
                { v: "even", label: "Чёт" },
              ].map((o) => (
                <button
                  key={o.v}
                  onClick={() => setPairForm((f) => ({ ...f, weekType: o.v }))}
                  className="btn"
                  style={
                    pairForm.weekType === o.v
                      ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "transparent" }
                      : {}
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button className="btn" onClick={() => setAddPairDow(null)}>Отмена</button>
            <button className="btn btn-accent" onClick={addPair} disabled={!pairForm.subject.trim()}>
              Добавить
            </button>
          </div>
        </div>
      </Modal>

      {/* Единоразовое изменение расписания */}
      <Modal
        open={ovrOpen}
        onClose={() => setOvrOpen(false)}
        title={`Изменение на ${selectedDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`}
      >
        <div className="space-y-3.5">
          <p className="text-sm muted m-0">
            Действует только в этот день — постоянное расписание не меняется.
          </p>
          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Что происходит
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "cancel", label: "Отмена" },
                { v: "move", label: "Перенос" },
                { v: "add", label: "Доп. пара" },
              ].map((o) => (
                <button
                  key={o.v}
                  className="btn"
                  disabled={o.v !== "add" && basePairs.length === 0}
                  onClick={() => setOvrForm((f) => ({ ...f, kind: o.v }))}
                  style={
                    ovrForm.kind === o.v
                      ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "transparent" }
                      : {}
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {(ovrForm.kind === "cancel" || ovrForm.kind === "move") && (
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                Какая пара
              </label>
              <select
                className="select"
                value={ovrForm.pairId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const src = basePairs.find((x) => x.id === id);
                  setOvrForm((f) => ({
                    ...f,
                    pairId: id,
                    subject: f.kind === "move" ? src?.subject || "" : f.subject,
                    num: src?.num || f.num,
                    timeFrom: f.kind === "move" ? src?.timeFrom || "" : f.timeFrom,
                    timeTo: f.kind === "move" ? src?.timeTo || "" : f.timeTo,
                  }));
                }}
              >
                <option value={0}>— выберите пару —</option>
                {basePairs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.num}. {p.subject}
                    {p.timeFrom ? ` (${p.timeFrom})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {ovrForm.kind !== "cancel" && (
            <>
              <div>
                <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                  Предмет
                </label>
                <input
                  className="input"
                  list="ovr-subjects"
                  value={ovrForm.subject}
                  onChange={(e) => setOvrForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Название предмета"
                />
                <datalist id="ovr-subjects">
                  {subjects.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                  {pairs.map((p) => (
                    <option key={`p${p.id}`} value={p.subject} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">№</label>
                  <input
                    className="input" type="number" min={1} max={10}
                    value={ovrForm.num}
                    onChange={(e) => setOvrForm((f) => ({ ...f, num: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Начало</label>
                  <input
                    className="input" type="time"
                    value={ovrForm.timeFrom}
                    onChange={(e) => setOvrForm((f) => ({ ...f, timeFrom: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">Конец</label>
                  <input
                    className="input" type="time"
                    value={ovrForm.timeTo}
                    onChange={(e) => setOvrForm((f) => ({ ...f, timeTo: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                  Кабинет
                </label>
                <input
                  className="input"
                  value={ovrForm.room}
                  onChange={(e) => setOvrForm((f) => ({ ...f, room: e.target.value }))}
                  placeholder="Например: 214"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Комментарий
            </label>
            <input
              className="input"
              value={ovrForm.note}
              onChange={(e) => setOvrForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Причина: болезнь преподавателя, замена…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button className="btn" onClick={() => setOvrOpen(false)}>Отмена</button>
            <button className="btn btn-accent" onClick={addOverride}>
              Сохранить
            </button>
          </div>
        </div>
      </Modal>

      <Confirm
        open={!!delOvr}
        onClose={() => setDelOvr(null)}
        title="Отменить изменение?"
        what="День вернётся к обычному расписанию."
        danger={false}
        onConfirm={deleteOverride}
      />

      <Confirm
        open={!!delPair}
        onClose={() => setDelPair(null)}
        title="Удалить пару?"
        what={`Пара «${delPair?.subject}» (${delPair ? DOW_NAMES[delPair.dow] : ""}) будет удалена из расписания.`}
        onConfirm={deletePair}
      />
      <Confirm
        open={!!delHw}
        onClose={() => setDelHw(null)}
        title="Удалить задание?"
        what={`«${delHw?.task}» · ${delHw?.subject}`}
        onConfirm={deleteHw}
      />
    </div>
  );
}

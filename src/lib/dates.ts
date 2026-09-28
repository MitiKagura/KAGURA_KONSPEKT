// Клиент-safe помощники дат: недели, чётность, русские названия
export const DOW_NAMES = [
  "",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
export const DOW_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** 'YYYY-MM-DD' в локальной зоне */
export function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 1 = понедельник … 7 = воскресенье */
export function dowOf(d: Date) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** Номер ISO-недели */
export function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export type Parity = "odd" | "even";

/** Календарная чётность ISO-недели без пользовательского якоря. */
export function parityOfWeek(date: Date): Parity {
  return isoWeek(date) % 2 === 1 ? "odd" : "even";
}

/**
 * Чётность недели с учётом якоря пользователя.
 * Значение зависит только от даты, поэтому при переходе к следующей неделе
 * чётность чередуется сама — вручную переключать ничего не нужно.
 */
export function parityOfWeekFor(date: Date, flip: boolean): Parity {
  const base = parityOfWeek(date);
  if (!flip) return base;
  return base === "odd" ? "even" : "odd";
}

/**
 * Вычисляет якорь: нужно ли инвертировать календарную чётность, чтобы
 * указанная неделя считалась заданной пользователем чётностью.
 */
export function parityFlipFor(date: Date, desired: Parity): boolean {
  return parityOfWeek(date) !== desired;
}

export function parityLabel(p: Parity) {
  return p === "odd" ? "Нечётная" : "Чётная";
}

/** Понедельник недели, содержащей дату */
export function mondayOf(d: Date) {
  const res = new Date(d);
  const dow = dowOf(d);
  res.setDate(res.getDate() - (dow - 1));
  res.setHours(0, 0, 0, 0);
  return res;
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Проходит ли пара в выбранную чётность */
export function pairActive(weekType: string, parity: Parity) {
  return weekType === "all" || weekType === parity;
}

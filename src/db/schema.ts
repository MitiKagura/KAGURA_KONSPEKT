import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  date,
} from "drizzle-orm/pg-core";

export const users = pgTable("kk_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // 'admin' | 'user'
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subjects = pgTable("kk_subjects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notes = pgTable("kk_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Без названия"),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const homework = pgTable("kk_homework", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  task: text("task").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pairs = pgTable("kk_pairs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dow: integer("dow").notNull(), // 1 = Monday .. 7 = Sunday
  num: integer("num").notNull().default(1),
  subject: text("subject").notNull(),
  timeFrom: text("time_from").notNull().default(""),
  timeTo: text("time_to").notNull().default(""),
  weekType: text("week_type").notNull().default("all"), // 'all' | 'odd' | 'even'
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aiJobs = pgTable("kk_ai_jobs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  noteId: integer("note_id"),
  title: text("title").notNull().default("Запрос"),
  mode: text("mode").notNull().default("analyze"),
  prompt: text("prompt").notNull(),
  response: text("response").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending|running|done|error
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userSettings = pgTable("kk_user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  wallpaperExt: text("wallpaper_ext"), // 'jpg' | 'png' | 'webp' | null
  /**
   * Якорь чётности: если true — календарная чётность ISO-недели инвертируется.
   * Благодаря этому чётность вычисляется от даты и сама чередуется каждую неделю.
   */
  weekParityFlip: boolean("week_parity_flip").notNull().default(false),
  /**
   * Режим MD2PDF:
   *  - system — встроенный конвертер KAGURA с оформлением выбранной темы;
   *  - site   — внешний сайт из md2pdfUrl через прокси.
   */
  md2pdfMode: text("md2pdf_mode").notNull().default("system"),
  /** Ссылка на внешний конвертер Markdown → PDF. */
  md2pdfUrl: text("md2pdf_url").notNull().default("https://md2pdf.cc/"),
  /** Ссылка на сервис озвучки. По умолчанию пусто — задаёт пользователь. */
  ttsUrl: text("tts_url").notNull().default(""),
  /** Устаревшее поле, сохранено во избежание конфликтов миграции */
  pdfBgImageExt: text("pdf_bg_image_ext"),
  /** JSON-конфигурация фонов для PDF (масштаб, позиция, прозрачность) */
  pdfBgConfig: text("pdf_bg_config").notNull().default("{}"),
});

/**
 * Единоразовые изменения расписания на конкретную дату:
 *  - cancel  — пара отменена
 *  - move    — перенос (время/кабинет/предмет)
 *  - add     — дополнительная пара
 */
export const scheduleOverrides = pgTable("kk_schedule_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  kind: text("kind").notNull().default("add"), // 'cancel' | 'move' | 'add'
  /** Для cancel/move — какая пара из расписания меняется */
  pairId: integer("pair_id").references(() => pairs.id, { onDelete: "cascade" }),
  subject: text("subject").notNull().default(""),
  num: integer("num").notNull().default(1),
  timeFrom: text("time_from").notNull().default(""),
  timeTo: text("time_to").notNull().default(""),
  room: text("room").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teachers = pgTable("kk_teachers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  name: text("name").notNull(),
  room: text("room").notNull().default(""),
  // Опциональные контакты
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  messenger: text("messenger").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Homework = typeof homework.$inferSelect;
export type Pair = typeof pairs.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type Teacher = typeof teachers.$inferSelect;
export type ScheduleOverride = typeof scheduleOverrides.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  FileText,
  History,
  ListChecks,
  Loader2,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";
import QuizRunner from "@/components/quiz-runner";
import { isQuizPayload, type QuizPayload } from "@/lib/quiz-types";

interface Subject { id: number; name: string }
interface Note { id: number; subjectId: number; title: string; content: string }
interface Job {
  id: number;
  title: string;
  mode: string;
  status: string;
  response: string;
  error: string | null;
  createdAt: string;
}

export default function QuizPage() {
  const toast = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteId, setNoteId] = useState<number | null>(null);
  const [manualText, setManualText] = useState("");
  const [search, setSearch] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/ai");
      const data = await response.json();
      if (response.ok) {
        setHistory((data.jobs as Job[]).filter((item) => item.mode === "questions"));
      }
    } catch {
      /* история не критична */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [subjectsData, notesData] = await Promise.all([
          fetch("/api/subjects").then((r) => r.json()),
          fetch("/api/notes").then((r) => r.json()),
        ]);
        setSubjects(subjectsData.subjects || []);
        setNotes(notesData.notes || []);
        if (notesData.notes?.length) setNoteId(notesData.notes[0].id);
        await loadHistory();
      } catch {
        toast.push("Не удалось загрузить конспекты", true);
      } finally {
        setLoading(false);
      }
    })();
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyJob(next: Job) {
    setJob(next);
    if (next.status === "done") {
      try {
        const parsed = JSON.parse(next.response);
        setQuiz(isQuizPayload(parsed) ? parsed : null);
      } catch {
        setQuiz(null);
      }
    }
  }

  const startPoll = useCallback(
    (id: number) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/ai/${id}`);
          if (!response.ok) return;
          const data = await response.json();
          applyJob(data.job);
          if (data.job.status === "done" || data.job.status === "error") {
            stopPoll();
            loadHistory();
          }
        } catch {
          /* сеть могла пропасть — повторим на следующем тике */
        }
      }, 1800);
    },
    [stopPoll, loadHistory],
  );

  async function generate() {
    const selectedNote = notes.find((item) => item.id === noteId);
    const text = manualText.trim() || selectedNote?.content?.trim() || "";
    if (!text) {
      toast.push("Выберите конспект или вставьте текст", true);
      return;
    }
    setQuiz(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "questions",
          text,
          noteId: manualText.trim() ? null : noteId,
          title: selectedNote?.title || "Тест",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка запуска");
      const pending: Job = {
        id: data.id,
        title: selectedNote?.title || "Тест",
        mode: "questions",
        status: "pending",
        response: "",
        error: null,
        createdAt: new Date().toISOString(),
      };
      setJob(pending);
      startPoll(data.id);
      toast.push("Генерируем тест — можно перейти в другой раздел, он сохранится");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Ошибка", true);
    }
  }

  async function openJob(id: number) {
    const response = await fetch(`/api/ai/${id}`);
    const data = await response.json();
    if (!response.ok) return;
    applyJob(data.job);
    if (data.job.status === "pending" || data.job.status === "running") {
      startPoll(data.job.id);
    }
  }

  async function removeJob(id: number) {
    await fetch(`/api/ai/${id}`, { method: "DELETE" });
    if (job?.id === id) {
      setJob(null);
      setQuiz(null);
    }
    loadHistory();
  }

  const subjectOf = (id: number) =>
    subjects.find((item) => item.id === id)?.name || "";

  // Поиск по названию конспекта и по названию предмета
  const query = search.trim().toLowerCase();
  const foundNotes = query
    ? notes.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          subjectOf(note.subjectId).toLowerCase().includes(query),
      )
    : notes;

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size={34} />
      </div>
    );
  }

  const working = job && (job.status === "pending" || job.status === "running");
  return (
    <div>
      <header className="page-hero anim-in">
        <h1 className="page-title">Тестирование</h1>
        <p className="page-sub">
          ИИ составляет тест по конспекту · один верный ответ из четырёх · с
          поддержкой формул LaTeX
        </p>
      </header>

      {/* Активный тест */}
      {quiz && job?.status === "done" ? (
        <div className="space-y-4 anim-in anim-in-1">
          <QuizRunner quiz={quiz} />
          <button
            className="btn"
            onClick={() => {
              setJob(null);
              setQuiz(null);
            }}
          >
            <ListChecks size={15} /> Составить новый тест
          </button>
        </div>
      ) : working ? (
        <section className="panel p-8 text-center anim-in anim-in-1">
          <Sparkles
            size={30}
            style={{ color: "var(--accent)" }}
            className="mx-auto mb-4 animate-pulse"
          />
          <p className="text-sm font-bold mb-1">
            {job?.status === "pending" ? "Задача в очереди…" : "Модель составляет тест…"}
          </p>
          <p className="text-xs muted mb-4">
            Можно уйти в другой раздел — результат сохранится в истории.
          </p>
          <Loader2
            size={20}
            className="animate-spin mx-auto"
            style={{ color: "var(--accent)" }}
          />
        </section>
      ) : job?.status === "error" ? (
        <section className="panel p-6 anim-in anim-in-1">
          <div
            className="p-4 rounded-xl text-sm mb-4"
            style={{
              background: "color-mix(in srgb, #ff5470 12%, transparent)",
              border: "1px solid color-mix(in srgb, #ff5470 30%, transparent)",
              color: "#ff8fa3",
            }}
          >
            {job.error}
          </div>
          <button className="btn btn-accent" onClick={() => setJob(null)}>
            Попробовать снова
          </button>
        </section>
      ) : (
        /* Форма создания теста */
        <section className="panel p-5 anim-in anim-in-1 space-y-4">
          <div className="row gap-2">
            <Bot size={18} style={{ color: "var(--accent)" }} />
            <h2 className="text-base font-bold m-0">Составить тест</h2>
          </div>

          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Конспект
            </label>
            <div className="row gap-2 panel-flat px-3 py-1 mb-2">
              <Search size={15} className="muted shrink-0" />
              <input
                className="input !border-0 !bg-transparent !px-1"
                style={{ boxShadow: "none" }}
                placeholder="Поиск по названию конспекта или предмету…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  className="btn btn-icon btn-ghost !p-1.5"
                  onClick={() => setSearch("")}
                  title="Очистить"
                >
                  <X size={14} />
                </button>
              )}
              <span className="chip shrink-0">{foundNotes.length}</span>
            </div>

            {notes.length === 0 ? (
              <p className="text-sm muted m-0">
                Конспектов пока нет — вставьте текст в поле ниже.
              </p>
            ) : foundNotes.length === 0 ? (
              <p className="text-sm muted m-0">
                Ничего не найдено по запросу «{search}».
              </p>
            ) : (
              <div className="quiz-note-list">
                {foundNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="quiz-note"
                    data-active={noteId === note.id}
                    onClick={() => setNoteId(note.id)}
                  >
                    <FileText size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold truncate">
                        {note.title}
                      </span>
                      <span className="block text-xs muted truncate">
                        {subjectOf(note.subjectId) || "Без предмета"} ·{" "}
                        {note.content.trim().length} символов
                      </span>
                    </span>
                    {noteId === note.id && (
                      <Check size={15} style={{ color: "var(--accent)" }} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
              Или свой текст (тогда конспект не используется)
            </label>
            <textarea
              className="textarea font-mono text-xs"
              rows={5}
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder="Вставьте материал, по которому нужен тест…"
            />
          </div>

          <p className="text-xs muted m-0">
            Количество вопросов ИИ подберёт сам: от 2 до 10 в зависимости от объёма
            темы. Для расчётных предметов добавит задачи с вычислением.
          </p>

          <button className="btn btn-accent" onClick={generate}>
            <Send size={15} /> Сгенерировать тест
          </button>
        </section>
      )}

      {/* История тестов */}
      <section className="panel p-4 mt-4 anim-in anim-in-2">
        <div className="row gap-2 mb-3">
          <History size={16} style={{ color: "var(--accent2)" }} />
          <h2 className="text-sm font-bold m-0">Ранее созданные тесты</h2>
        </div>
        {history.length === 0 ? (
          <EmptyState title="Пока пусто" hint="Созданные тесты появятся здесь" />
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div key={item.id} className="panel-flat px-4 py-2.5 row gap-3">
                <ListChecks size={15} style={{ color: "var(--accent)" }} />
                <button
                  className="flex-1 text-left min-w-0"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "var(--text)",
                  }}
                  onClick={() => openJob(item.id)}
                >
                  <div className="text-sm font-semibold truncate">{item.title}</div>
                  <div className="text-xs muted">
                    {new Date(item.createdAt).toLocaleString("ru-RU")} ·{" "}
                    {item.status === "done"
                      ? "готов"
                      : item.status === "error"
                        ? "ошибка"
                        : "в работе"}
                  </div>
                </button>
                <button
                  className="btn btn-icon btn-ghost hover:!text-red-400"
                  onClick={() => removeJob(item.id)}
                  title="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

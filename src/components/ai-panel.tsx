"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  History,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { MarkdownView } from "@/components/markdown";
import { Spinner, EmptyState } from "@/components/ui";
import { useToast } from "@/components/providers";

interface AiJob {
  id: number;
  title: string;
  mode: string;
  status: string;
  response: string;
  error: string | null;
  createdAt: string;
}

const MODES = [
  { id: "analyze", name: "Анализ", desc: "Разбор, ключевые тезисы, пробелы" },
  { id: "summarize", name: "Кратко", desc: "Сжатый пересказ списком" },
  { id: "expand", name: "Дополнить", desc: "Раскрыть темы и добавить примеры" },
  { id: "speech", name: "Сплошным текстом", desc: "Для озвучки: ударения, числа словами" },
  { id: "custom", name: "Свой запрос", desc: "Свободная формулировка" },
];

export function AiPanel({
  open,
  onClose,
  noteId,
  initialText,
  noteTitle,
}: {
  open: boolean;
  onClose: () => void;
  noteId?: number | null;
  initialText?: string;
  noteTitle?: string;
}) {
  const toast = useToast();
  const [mode, setMode] = useState("analyze");
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [job, setJob] = useState<AiJob | null>(null);
  const [history, setHistory] = useState<AiJob[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/ai");
      const data = await res.json();
      if (res.ok) setHistory(data.jobs);
    } catch {
      /* история не критична */
    }
  }, []);

  useEffect(() => {
    if (open) {
      setText(initialText || "");
      setShowHistory(false);
      loadHistory();
      // Если был запущенный ранее job — восстановим состояние
      setJob((j) => (j && (j.status === "pending" || j.status === "running") ? j : null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPoll = useCallback(
    (id: number) => {
      stopPoll();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/ai/${id}`);
          if (!res.ok) return;
          const data = await res.json();
          setJob(data.job);
          if (data.job.status === "done" || data.job.status === "error") {
            stopPoll();
            loadHistory();
          }
        } catch {
          /* сеть пропала — попробуем снова */
        }
      }, 1800);
    },
    [stopPoll, loadHistory],
  );

  useEffect(() => stopPoll, [stopPoll]);

  async function submit() {
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          text,
          customPrompt: custom,
          noteId: noteId ?? null,
          title: noteTitle ? `${noteTitle}` : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка запуска");
      setJob({
        id: data.id,
        title: noteTitle || "Запрос",
        mode,
        status: "pending",
        response: "",
        error: null,
        createdAt: new Date().toISOString(),
      });
      startPoll(data.id);
      toast.push("Задача отправлена в ИИ. Можно свернуть панель — ответ сохранится.");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка", true);
    }
  }

  async function copyAnswer() {
    if (!job?.response) return;
    try {
      await navigator.clipboard.writeText(job.response);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = job.response;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function openJob(id: number) {
    const res = await fetch(`/api/ai/${id}`);
    const data = await res.json();
    if (res.ok) {
      setJob(data.job);
      setShowHistory(false);
      if (data.job.status === "pending" || data.job.status === "running") {
        startPoll(data.job.id);
      }
    }
  }

  async function deleteJob(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/ai/${id}`, { method: "DELETE" });
    loadHistory();
    if (job?.id === id) setJob(null);
  }

  if (!open) return null;

  const working = job && (job.status === "pending" || job.status === "running");

  return (
    <div
      className="fixed z-90 inset-x-0 bottom-0 sm:right-6 sm:bottom-6 sm:left-auto sm:w-[560px] sm:max-h-[82dvh] flex flex-col panel"
      style={{
        zIndex: 90,
        maxHeight: "88dvh",
        boxShadow: "0 30px 90px -20px rgba(0,0,0,0.75)",
        animation: "slideUp 0.28s cubic-bezier(0.2,1.2,0.4,1)",
      }}
    >
      {/* Шапка */}
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: "var(--line)" }}
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "color-mix(in srgb, var(--accent) 16%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
          }}
        >
          <Bot size={18} style={{ color: "var(--accent)" }} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">ИИ-анализатор · qwen3:8b</div>
          <div className="text-xs muted truncate">
            {working
              ? job!.status === "pending"
                ? "В очереди…"
                : "Модель думает — можно свернуть, ответ сохранится"
              : job
                ? job.status === "done"
                  ? "Ответ готов"
                  : "Ошибка выполнения"
                : "Ollama · локально, без интернета"}
          </div>
        </div>
        {working && (
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
        )}
        <button
          className="btn btn-icon btn-ghost"
          title="История запросов"
          onClick={() => {
            setShowHistory((s) => !s);
            loadHistory();
          }}
        >
          <History size={17} />
        </button>
        <button
          className="btn btn-icon btn-ghost"
          title="Свернуть (задача продолжит работу)"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>

      <div className="overflow-auto p-5 flex-1">
        {showHistory ? (
          history.length === 0 ? (
            <EmptyState icon={<History size={30} />} title="История пуста" hint="Запросы к ИИ появятся здесь — их можно открыть с любого устройства" />
          ) : (
            <div className="space-y-2">
              {history.map((j) => (
                <button
                  key={j.id}
                  onClick={() => openJob(j.id)}
                  className="w-full text-left panel-flat p-3 row gap-3 transition-colors"
                  style={{ cursor: "pointer", border: "1px solid var(--line)", background: "var(--surface2)", fontFamily: "inherit" }}
                >
                  <MessageSquareText size={16} style={{ color: "var(--accent)" }} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{j.title}</div>
                    <div className="text-xs muted">
                      {new Date(j.createdAt).toLocaleString("ru-RU")} ·{" "}
                      {j.status === "done"
                        ? "готово"
                        : j.status === "error"
                          ? "ошибка"
                          : "в работе…"}
                    </div>
                  </div>
                  {j.status !== "done" && j.status !== "error" && (
                    <Spinner size={14} />
                  )}
                  <span
                    className="btn btn-icon btn-ghost"
                    onClick={(e) => deleteJob(j.id, e)}
                    title="Удалить из истории"
                    role="button"
                  >
                    <Trash2 size={14} />
                  </span>
                </button>
              ))}
            </div>
          )
        ) : job ? (
          /* ---- Результат / процесс ---- */
          <div>
            {working && (
              <div className="flex flex-col items-center py-12 gap-4">
                <Sparkles size={30} style={{ color: "var(--accent)" }} className="animate-pulse" />
                <div className="text-sm font-semibold">
                  {job.status === "pending" ? "Задача в очереди…" : "Модель генерирует ответ…"}
                </div>
                <div className="text-xs muted text-center max-w-xs">
                  Можно закрыть панель и заняться другими делами — ответ сохранится в истории
                  и будет доступен с любого устройства.
                </div>
                <button className="btn mt-2" onClick={() => setJob(null)}>
                  Новый запрос
                </button>
              </div>
            )}
            {job.status === "error" && (
              <div>
                <div
                  className="p-4 rounded-xl text-sm"
                  style={{
                    background: "color-mix(in srgb, #ff5470 12%, transparent)",
                    border: "1px solid color-mix(in srgb, #ff5470 30%, transparent)",
                    color: "#ff8fa3",
                  }}
                >
                  {job.error}
                </div>
                <button className="btn mt-4" onClick={() => setJob(null)}>
                  Новый запрос
                </button>
              </div>
            )}
            {job.status === "done" && (
              <>
                <div className="row gap-2 mb-4 flex-wrap">
                  <button className="btn btn-accent" onClick={copyAnswer}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Скопировано" : "Копировать ответ"}
                  </button>
                  <button className="btn" onClick={() => setJob(null)}>
                    Новый запрос
                  </button>
                </div>
                {job.mode === "speech" ? (
                  /* Текст для озвучки показываем как есть: без Markdown,
                     чтобы ударения и пунктуация читались один в один. */
                  <div className="panel-flat p-4">
                    <pre className="speech-output">{job.response}</pre>
                  </div>
                ) : (
                  <div className="panel-flat p-4">
                    <MarkdownView source={job.response} />
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ---- Форма запроса ---- */
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="p-3 rounded-xl text-left transition-all"
                  style={{
                    background:
                      mode === m.id
                        ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                        : "var(--surface2)",
                    border: `1px solid ${
                      mode === m.id ? "color-mix(in srgb, var(--accent) 45%, transparent)" : "var(--line)"
                    }`,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "var(--text)",
                  }}
                >
                  <div className="text-sm font-bold" style={mode === m.id ? { color: "var(--accent)" } : {}}>
                    {m.name}
                  </div>
                  <div className="text-[11px] muted mt-0.5 leading-snug">{m.desc}</div>
                </button>
              ))}
            </div>
            {mode === "custom" && (
              <div>
                <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                  Ваш запрос к модели
                </label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Например: объясни эту тему как пятикласснику…"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold muted uppercase tracking-wider block mb-1.5">
                Текст для анализа
              </label>
              <textarea
                className="textarea font-mono text-xs"
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Вставьте текст конспекта или вопрос…"
              />
            </div>
            <button
              className="btn btn-accent w-full"
              onClick={submit}
              disabled={mode === "custom" ? !custom.trim() : !text.trim()}
            >
              <Send size={15} /> Отправить в ИИ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

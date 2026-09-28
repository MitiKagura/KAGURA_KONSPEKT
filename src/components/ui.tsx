"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useToast } from "@/components/providers";

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty anim-in">
      {icon && (
        <div className="flex justify-center mb-3 opacity-60">{icon}</div>
      )}
      <div className="font-semibold">{title}</div>
      {hint && <div className="text-sm mt-1">{hint}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  size?: "wide" | "xwide";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Первый Escape в видеорежиме обрабатывает VideoPlayer и только выходит
      // из него; модалка просмотра остаётся открытой.
      if (document.documentElement.classList.contains("video-page-locked")) return;
      onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal${size ? " " + size : ""}`} onClick={(e) => e.stopPropagation()}>
        <div data-modal-header className="flex items-start justify-between gap-4 mb-4">
          <h3 className="text-lg font-bold m-0 leading-snug">{title}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose} title="Закрыть (Esc)">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Подтверждение с обязательным вводом слова "yes" — для удаления разделов и пользователей. */
export function YesConfirm({
  open,
  onClose,
  onConfirm,
  title,
  what,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  what: string;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    // Компонент не размонтируется (возвращает null), поэтому состояние надо
    // сбрасывать явно — иначе после успешного удаления busy остаётся true
    // и следующее окно открывается с «вечным» спиннером.
    setValue("");
    setBusy(false);
  }, [open]);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Ошибка", true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const ok = value.trim().toLowerCase() === "yes";
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            background: "color-mix(in srgb, #ff5470 15%, transparent)",
            border: "1px solid color-mix(in srgb, #ff5470 35%, transparent)",
          }}
        >
          <AlertTriangle size={26} style={{ color: "#ff8fa3" }} />
        </div>
        <h3 className="text-lg font-bold text-center m-0 mb-2">{title}</h3>
        <p className="text-sm muted text-center mb-1">{what}</p>
        <p className="text-sm text-center mb-5" style={{ color: "#ff8fa3" }}>
          Действие необратимо. Введите <b>yes</b> для подтверждения.
        </p>
        <input
          className="input text-center font-bold tracking-widest"
          style={{
            borderColor: ok
              ? "color-mix(in srgb, #ff5470 60%, transparent)"
              : undefined,
            letterSpacing: "0.3em",
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="yes"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && ok) void run();
          }}
        />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            className="btn btn-danger"
            disabled={!ok || busy}
            onClick={() => void run()}
          >
            {busy ? <Spinner /> : "Удалить навсегда"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Обычное стилизованное подтверждение (для файлов, заметок и пр.). */
export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  what,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  what: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Тот же сброс: компонент остаётся смонтированным, поэтому без этого
  // после первого успешного удаления кнопка навсегда залипала в спиннере.
  useEffect(() => {
    setBusy(false);
  }, [open]);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Ошибка", true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold m-0 mb-2">{title}</h3>
        <p className="text-sm muted mb-6">{what}</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-accent"}`}
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? <Spinner /> : "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

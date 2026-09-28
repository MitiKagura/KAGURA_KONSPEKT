"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileWarning,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Spinner } from "@/components/ui";
import { MarkdownView } from "@/components/markdown";

export function streamUrl(rel: string) {
  return `/api/files/stream?path=${encodeURIComponent(rel)}`;
}
export function downloadUrl(rel: string) {
  return `/api/files/download?path=${encodeURIComponent(rel)}`;
}

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = m.toString().padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${sec.toString().padStart(2, "0")}` : `${mm}:${sec.toString().padStart(2, "0")}`;
}

/* --- Типы Fullscreen API с vendor-префиксами --- */
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
}

/* ==================== ВИДЕОПЛЕЕР (кастомный) ==================== */
export function VideoPlayer({
  src,
  title,
  onEnded,
  onClose,
}: {
  src: string;
  title: string;
  onEnded?: () => void;
  /** Esc закрывает просмотрщик, когда плеер не в полноэкранном режиме. */
  onClose?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState(true);
  const [fsState, setFs] = useState(false);
  const [err, setErr] = useState("");

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControls(false);
    }, 2600);
  }, []);

  const lockedOverlayRef = useRef<HTMLElement | null>(null);

  /** Снимает вспомогательные CSS-классы (используются как фолбэк). */
  const clearCssFullscreen = useCallback(() => {
    lockedOverlayRef.current?.classList.remove("video-fullscreen-active");
    wrapRef.current
      ?.closest<HTMLElement>(".modal-overlay")
      ?.classList.remove("video-fullscreen-active");
    lockedOverlayRef.current = null;
    document.documentElement.classList.remove("video-page-locked");
    document.body.classList.remove("video-page-locked");
  }, []);

  // Синхронизируем состояние с настоящим Fullscreen API браузера,
  // чтобы выход по F11/Esc/жестам ОС тоже корректно отражался в UI.
  useEffect(() => {
    poke();
    function onFsChange() {
      const active = Boolean(
        document.fullscreenElement ||
          (document as FsDocument).webkitFullscreenElement,
      );
      setFs(active);
      setControls(true);
      if (!active) clearCssFullscreen();
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      // Страховка при закрытии просмотрщика прямо из полноэкранного режима
      const doc = document as FsDocument;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      }
      clearCssFullscreen();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [poke, clearCssFullscreen]);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }, []);

  /**
   * НАСТОЯЩИЙ полноэкранный режим через Fullscreen API — видео разворачивается
   * на весь монитор, а не только внутри окна браузера.
   * CSS-режим остаётся аварийным фолбэком, если API недоступен (iOS WebView).
   */
  const enterFullscreen = useCallback(async () => {
    const el = wrapRef.current as FsElement | null;
    if (!el) return;
    setControls(true);
    try {
      const request = el.requestFullscreen || el.webkitRequestFullscreen;
      if (request) {
        await request.call(el, { navigationUI: "hide" } as FullscreenOptions);
        setFs(true);
        return;
      }
      // iOS Safari: полноэкранный режим самого <video>
      const video = videoRef.current as (HTMLVideoElement & FsElement) | null;
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        setFs(true);
        return;
      }
      throw new Error("Fullscreen API недоступен");
    } catch {
      // Фолбэк: разворачиваем средствами CSS внутри страницы
      const overlay = wrapRef.current?.closest<HTMLElement>(".modal-overlay") ?? null;
      if (overlay) {
        lockedOverlayRef.current = overlay;
        overlay.classList.add("video-fullscreen-active");
        document.documentElement.classList.add("video-page-locked");
        document.body.classList.add("video-page-locked");
      }
      setFs(true);
    }
  }, []);

  /** Только выход — без обратного входа в рамках одного события. */
  const exitFullscreenOnly = useCallback(async () => {
    const doc = document as FsDocument;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        const exit =
          doc.exitFullscreen ||
          doc.webkitExitFullscreen ||
          doc.webkitCancelFullScreen;
        if (exit) await exit.call(doc);
      }
      const video = videoRef.current as (HTMLVideoElement & FsElement) | null;
      video?.webkitExitFullscreen?.();
    } catch {
      // Ниже всё равно снимаем CSS-режим и состояние
    }
    clearCssFullscreen();
    setFs(false);
    setControls(true);
  }, [clearCssFullscreen]);

  /** Перемотка на указанное число секунд с ограничением по длине ролика. */
  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const next = Math.min(Math.max(0, video.currentTime + seconds), duration);
    video.currentTime = next;
    setTime(next);
    setControls(true);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as FsDocument;
    const active =
      Boolean(doc.fullscreenElement || doc.webkitFullscreenElement) || fsState;
    if (active) void exitFullscreenOnly();
    else void enterFullscreen();
  }, [enterFullscreen, exitFullscreenOnly, fsState]);

  /*
   * Горячие клавиши плеера:
   *   F        — включить/выключить полный экран
   *   ← / →    — перемотка на 5 секунд назад/вперёд
   *   Space, K — пауза и продолжение
   *   Esc      — выйти ТОЛЬКО из плеера: сперва из полного экрана,
   *              затем закрыть сам просмотрщик
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();

      if (key === "f" || key === "а") {
        event.preventDefault();
        toggleFullscreen();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-5);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(5);
        return;
      }
      if (event.code === "Space" || key === "k" || key === "л") {
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        // Останавливаем другие обработчики Escape, чтобы закрылся
        // именно плеер, а не что-то ещё на странице.
        event.stopImmediatePropagation();
        if (fsState) exitFullscreenOnly();
        else onClose?.();
      }
    }
    // capture=true: перехватываем раньше обработчика модального окна
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [exitFullscreenOnly, fsState, onClose, seekBy, toggle, toggleFullscreen]);

  return (
    <div
      ref={wrapRef}
      className={`video-shell relative w-full overflow-hidden select-none${
        fsState ? " video-shell-fullscreen" : ""
      }`}
      style={{
        background: "#000",
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        aspectRatio: "16/9",
      }}
      onMouseMove={poke}
      onTouchStart={poke}
      onDoubleClick={(e) => {
        // Двойной клик по панели управления не должен переключать полный экран
        if ((e.target as HTMLElement).closest("[data-controls]")) return;
        toggleFullscreen();
      }}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full"
        style={{ objectFit: "contain" }}
        playsInline
        controls={false}
        disablePictureInPicture
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.volume = volume;
        }}
        onEnded={onEnded}
        onError={() =>
          setErr("Браузер не поддерживает этот формат/кодек. Скачайте файл и откройте в системном плеере.")
        }
      />

      {/* Отдельная НЕСКРЫВАЕМАЯ кнопка. Она умеет только выходить — никогда входить. */}
      {fsState && (
        <button
          type="button"
          data-controls
          className="video-exit-fullscreen"
          aria-label="Выйти из полноэкранного режима"
          title="Выйти из полноэкранного режима"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void exitFullscreenOnly();
          }}
        >
          <Minimize size={18} />
          <span>Выйти</span>
        </button>
      )}

      {err && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
          style={{ background: "rgba(0,0,0,0.75)", color: "#ff8fa3" }}>
          <FileWarning size={34} />
          <div className="text-sm max-w-md">{err}</div>
          <a className="btn" href={src.replace("/stream?", "/download?")} download>
            <Download size={15} /> Скачать
          </a>
        </div>
      )}
      {!playing && !err && (
        <button
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.28)", border: "none", cursor: "pointer" }}
          aria-label="Смотреть"
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 74,
              height: 74,
              background: "color-mix(in srgb, var(--accent) 85%, transparent)",
              boxShadow: "0 14px 44px -8px color-mix(in srgb, var(--accent) 80%, transparent)",
              color: "var(--on-accent)",
            }}
          >
            <Play size={32} style={{ marginLeft: 4 }} />
          </span>
        </button>
      )}
      {/* Панель управления */}
      <div
        data-controls
        className="absolute left-0 right-0 bottom-0 px-4 pt-8 pb-3 transition-all"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(transparent, rgba(4,6,10,0.88))",
          opacity: controls ? 1 : 0,
          transform: controls ? "translateY(0)" : "translateY(8px)",
          pointerEvents: controls ? "auto" : "none",
        }}
      >
        <input
          className="seek w-full mb-2.5"
          type="range" min={0} max={duration || 0} step={0.1} value={time}
          onChange={(e) => {
            const t = Number(e.target.value);
            if (videoRef.current) videoRef.current.currentTime = t;
            setTime(t);
          }}
        />
        <div className="flex items-center gap-1.5 text-white">
          <button className="btn btn-icon btn-ghost !text-white" onClick={toggle}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            className="btn btn-icon btn-ghost !text-white"
            onClick={() => seekBy(-10)}
            title="Назад на 10 секунд"
          >
            <RotateCcw size={15} />
          </button>
          <button
            className="btn btn-icon btn-ghost !text-white"
            onClick={() => seekBy(10)}
            title="Вперёд на 10 секунд (стрелки — по 5 секунд)"
          >
            <RotateCw size={15} />
          </button>
          <span className="text-xs font-mono px-1" style={{ color: "var(--muted)" }}>
            {fmt(time)} / {fmt(duration)}
          </span>
          <span className="flex-1" />
          <button
            className="btn btn-icon btn-ghost !text-white"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !v.muted;
              setVolume(v.muted ? 0 : v.volume);
            }}
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            className="seek !w-20"
            type="range" min={0} max={1} step={0.05} value={volume}
            onChange={(e) => {
              const nv = Number(e.target.value);
              setVolume(nv);
              if (videoRef.current) {
                videoRef.current.volume = nv;
                videoRef.current.muted = nv === 0;
              }
            }}
          />
          <select
            className="text-xs font-semibold rounded-lg px-1.5 py-1"
            style={{
              background: "color-mix(in srgb, var(--surface2) 80%, transparent)",
              color: "var(--text)",
              border: "1px solid var(--line)",
            }}
            value={speed}
            onChange={(e) => {
              const s = Number(e.target.value);
              setSpeed(s);
              if (videoRef.current) videoRef.current.playbackRate = s;
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
          <button
            className="btn btn-icon btn-ghost !text-white"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            title={fsState ? "Выйти из полноэкранного (Esc)" : "Во весь экран"}
          >
            {fsState ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>
      <div
        className="absolute top-0 left-0 right-0 px-5 py-3 text-sm font-semibold truncate transition-opacity"
        style={{
          background: "linear-gradient(rgba(4,6,10,0.75), transparent)",
          opacity: controls ? 1 : 0,
          color: "#fff",
        }}
      >
        {title}
      </div>
    </div>
  );
}

/* ==================== PDF-ВЬЮВЕР (свой, на pdf.js) ==================== */
interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPage {
  getViewport(o: { scale: number }): PdfViewport;
  /** pdf.js v4: рендер принимает canvasContext + viewport */
  render(o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void>; cancel(): void };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}

export function PdfViewer({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const renderTask = useRef<{ cancel(): void } | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [rendered, setRendered] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setRendered(false);
    (async () => {
      try {
        // @ts-expect-error -- legacy build без типов
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
        // Воркер той же (legacy) сборки — иначе версия не совпадёт и PDF не отрисуется
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker";
        const d = (await pdfjs.getDocument({ url }).promise) as PdfDoc;
        if (!dead) {
          setDoc(d);
          setPage(1);
          setLoading(false);
        }
      } catch (e) {
        if (!dead) {
          setErr(e instanceof Error ? e.message : "Не удалось открыть PDF");
          setLoading(false);
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let dead = false;
    (async () => {
      try {
        const pg = await doc.getPage(page);
        const aw = boxRef.current?.clientWidth || 680;
        const base = pg.getViewport({ scale: 1 });
        const fit = Math.min((aw - 24) / base.width, scale);
        const vp = pg.getViewport({ scale: Math.max(0.4, fit) });
        const canvas = canvasRef.current!;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = vp.width * dpr;
        canvas.height = vp.height * dpr;
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d")!;
        // Масштабируем под DPR и заливаем белым (у PDF прозрачный фон)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, vp.width, vp.height);
        renderTask.current?.cancel();
        if (dead) return;
        const task = pg.render({ canvasContext: ctx, viewport: vp });
        renderTask.current = task;
        await task.promise;
        if (!dead) setRendered(true);
      } catch (e) {
        // RenderingCancelledException — норма при быстрой смене страниц
        const name = e instanceof Error ? e.name : "";
        if (!dead && name !== "RenderingCancelledException") {
          setErr(e instanceof Error ? e.message : "Ошибка отрисовки страницы");
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [doc, page, scale]);

  if (err) {
    return (
      <div className="empty">
        <FileWarning size={32} className="mx-auto mb-2 opacity-60" />
        {err}
      </div>
    );
  }
  return (
    <div>
      <div className="reader-toolbar">
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Назад
        </button>
        <span className="chip chip-accent">
          {loading ? "…" : `${page} / ${doc?.numPages ?? "…"}`}
        </span>
        <button
          className="btn"
          disabled={!doc || page >= (doc?.numPages || 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Вперёд
        </button>
        <span className="flex-1" />
        <button className="btn btn-icon" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} title="Отдалить">
          <ZoomOut size={16} />
        </button>
        <button className="btn btn-icon" onClick={() => setScale((s) => s + 0.2)} title="Приблизить">
          <ZoomIn size={16} />
        </button>
      </div>
      <div ref={boxRef} className="reader-stage">
        {(loading || !rendered) && (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="reader-page"
          style={{ display: loading || !rendered ? "none" : "block" }}
        />
      </div>
    </div>
  );
}

/* ==================== ОФИСНЫЕ ДОКУМЕНТЫ (через конвертацию в PDF) ==================== */
export function OfficeViewer({ rel }: { rel: string }) {
  const [pdf, setPdf] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch("/api/files/convert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: rel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Ошибка конвертации");
        if (!dead) {
          setPdf(streamUrl(data.pdf));
          setLoading(false);
        }
      } catch (e) {
        if (!dead) {
          setErr(e instanceof Error ? e.message : "Ошибка");
          setLoading(false);
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [rel]);

  if (loading) {
    return (
      <div className="empty">
        <Spinner size={30} />
        <div className="mt-4 font-semibold">Конвертируем документ в PDF…</div>
        <div className="text-sm mt-1">LibreOffice открывает форматы Word, Excel, PowerPoint, ODF</div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="empty">
        <FileWarning size={34} className="mx-auto mb-3 opacity-60" />
        <div className="max-w-md mx-auto">{err}</div>
        <a className="btn mt-4 inline-flex" href={downloadUrl(rel)} download>
          <Download size={15} /> Скачать файл
        </a>
      </div>
    );
  }
  return <PdfViewer url={pdf!} />;
}

/* ==================== ТЕКСТ / MARKDOWN ФАЙЛЫ ==================== */
export function TextViewer({ rel, kind }: { rel: string; kind: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let dead = false;
    fetch(streamUrl(rel))
      .then(async (r) => {
        if (!r.ok) throw new Error("Не удалось прочитать файл");
        return r.text();
      })
      .then((t) => !dead && setText(t))
      .catch((e) => !dead && setErr(e.message));
    return () => {
      dead = true;
    };
  }, [rel]);
  if (err) return <div className="empty">{err}</div>;
  if (text === null)
    return (
      <div className="flex justify-center py-14">
        <Spinner size={26} />
      </div>
    );
  if (kind === "markdown") {
    return (
      <div className="reader-markdown">
        <MarkdownView source={text} />
      </div>
    );
  }
  return (
    <pre className="reader-text">{text}</pre>
  );
}

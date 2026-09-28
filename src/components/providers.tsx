"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronUp,
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { DEFAULT_THEME, EDITABLE_VARS, THEMES } from "@/lib/themes";

/* ==================== ТОСТЫ ==================== */
interface ToastItem { id: number; text: string; err: boolean }
const ToastCtx = createContext<{ push: (t: string, err?: boolean) => void }>({
  push: () => undefined,
});
export const useToast = () => useContext(ToastCtx);

/* ==================== ТЕМА ==================== */
interface ThemeCtx {
  theme: string;
  setTheme: (t: string) => void;
  colors: Record<string, string>;
  setColor: (key: string, hex: string) => void;
  clearColor: (key: string) => void;
  resetColors: () => void;
  effective: Record<string, string>;
}
const ThemeContext = createContext<ThemeCtx>(null as never);
export const useTheme = () => useContext(ThemeContext);

function readColors(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem("kk.colors") || "{}");
  } catch {
    return {};
  }
}

/* ==================== АУДИОПЛЕЕР ==================== */
export interface Track { name: string; url: string }
/** off — по очереди до конца, all — зациклить плейлист, one — повтор трека */
export type RepeatMode = "off" | "all" | "one";

interface PlayerCtx {
  current: Track | null;
  queue: Track[];
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  playTrack: (t: Track, queue?: Track[], index?: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  openFull: () => void;
  closePlayer: () => void;
}
const PlayerContext = createContext<PlayerCtx>(null as never);
export const usePlayer = () => useContext(PlayerContext);

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  /* ---- toasts ---- */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, err = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  /* ---- theme ---- */
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const [allColors, setAllColors] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => {
    const t = localStorage.getItem("kk.theme") || DEFAULT_THEME;
    setThemeState(t);
    setAllColors(readColors());
  }, []);
  const apply = useCallback((t: string, colors: Record<string, string>) => {
    document.documentElement.setAttribute("data-theme", t);
    const def = THEMES.find((x) => x.id === t)?.vars || {};
    for (const item of EDITABLE_VARS) {
      const key = item.key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      const v = colors[item.key] || def[item.key];
      if (v) document.documentElement.style.setProperty(`--${key}`, v);
    }
  }, []);
  const setTheme = useCallback(
    (t: string) => {
      setThemeState(t);
      localStorage.setItem("kk.theme", t);
      apply(t, readColors()[t] || {});
    },
    [apply],
  );
  const setColor = useCallback(
    (key: string, hex: string) => {
      const all = readColors();
      all[theme] = { ...(all[theme] || {}), [key]: hex };
      localStorage.setItem("kk.colors", JSON.stringify(all));
      setAllColors(all);
      apply(theme, all[theme]);
    },
    [theme, apply],
  );
  const clearColor = useCallback(
    (key: string) => {
      const all = readColors();
      if (all[theme]) {
        delete all[theme][key];
        localStorage.setItem("kk.colors", JSON.stringify(all));
        setAllColors(all);
      }
      const def = THEMES.find((x) => x.id === theme)?.vars || {};
      const cssKey = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      if (def[key]) document.documentElement.style.setProperty(`--${cssKey}`, def[key]);
    },
    [theme],
  );
  const resetColors = useCallback(() => {
    const all = readColors();
    delete all[theme];
    localStorage.setItem("kk.colors", JSON.stringify(all));
    setAllColors(all);
    const def = THEMES.find((x) => x.id === theme)?.vars || {};
    for (const item of EDITABLE_VARS) {
      const key = item.key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      if (def[item.key]) document.documentElement.style.setProperty(`--${key}`, def[item.key]);
    }
  }, [theme]);
  const colors = allColors[theme] || {};
  const effective: Record<string, string> = {
    ...(THEMES.find((x) => x.id === theme)?.vars || {}),
    ...colors,
  };

  /* ---- audio player ---- */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.9);
  const [showFull, setShowFull] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);

  // Настройки плеера переживают перезагрузку страницы
  useEffect(() => {
    try {
      const r = localStorage.getItem("kk.player.repeat") as RepeatMode | null;
      if (r === "off" || r === "all" || r === "one") setRepeat(r);
      setShuffle(localStorage.getItem("kk.player.shuffle") === "1");
    } catch {
      /* localStorage может быть недоступен */
    }
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => {
      const nextMode: RepeatMode = r === "off" ? "all" : r === "all" ? "one" : "off";
      try {
        localStorage.setItem("kk.player.repeat", nextMode);
      } catch {
        /* ignore */
      }
      return nextMode;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      try {
        localStorage.setItem("kk.player.shuffle", s ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !s;
    });
  }, []);

  const playTrack = useCallback(
    (t: Track, q?: Track[], i?: number) => {
      const list = q && q.length ? q : [t];
      setQueue(list);
      const idx = i ?? Math.max(0, list.findIndex((x) => x.url === t.url));
      setIndex(idx);
      setCurrent(list[idx]);
      setShowFull(false);
    },
    [],
  );

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.url;
    a.volume = volume;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => undefined);
    } else {
      a.pause();
      setPlaying(false);
    }
  }, []);

  const jumpTo = useCallback((i: number) => {
    setIndex((cur) => {
      void cur;
      return i;
    });
    setQueue((q) => {
      if (q[i]) setCurrent(q[i]);
      return q;
    });
  }, []);

  /** Случайный трек, отличный от текущего (если в очереди больше одного). */
  const randomIndex = useCallback(() => {
    if (queue.length <= 1) return 0;
    let i = index;
    while (i === index) i = Math.floor(Math.random() * queue.length);
    return i;
  }, [index, queue.length]);

  /** Ручное переключение вперёд: shuffle учитывается, repeat=one — нет. */
  const next = useCallback(() => {
    if (shuffle) {
      jumpTo(randomIndex());
      return;
    }
    if (index < queue.length - 1) jumpTo(index + 1);
    else jumpTo(0);
  }, [shuffle, randomIndex, index, queue.length, jumpTo]);

  const prev = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 4) {
      audioRef.current.currentTime = 0;
      return;
    }
    if (shuffle) {
      jumpTo(randomIndex());
      return;
    }
    if (index > 0) jumpTo(index - 1);
    else jumpTo(queue.length - 1);
  }, [shuffle, randomIndex, index, queue.length, jumpTo]);

  /** Автопереход по окончании трека — здесь и работают repeat/shuffle. */
  const handleEnded = useCallback(() => {
    const a = audioRef.current;
    if (repeat === "one") {
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => undefined);
      }
      return;
    }
    if (shuffle) {
      jumpTo(randomIndex());
      return;
    }
    if (index < queue.length - 1) {
      jumpTo(index + 1);
      return;
    }
    // Конец очереди
    if (repeat === "all") {
      jumpTo(0);
    } else {
      setPlaying(false);
    }
  }, [repeat, shuffle, randomIndex, index, queue.length, jumpTo]);

  const seek = useCallback((sec: number) => {
    if (audioRef.current) audioRef.current.currentTime = sec;
  }, []);
  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);
  const closePlayer = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
    setCurrent(null);
    setShowFull(false);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      <ThemeContext.Provider value={{ theme, setTheme, colors, setColor, clearColor, resetColors, effective }}>
        <PlayerContext.Provider
          value={{
            current, queue, index, playing, time, duration, volume,
            repeat, shuffle,
            playTrack, toggle, next, prev, seek, setVolume,
            cycleRepeat, toggleShuffle,
            openFull: () => setShowFull(true),
            closePlayer,
          }}
        >
          {children}
          {/* Единственный audio-элемент приложения — живёт в корне, звук не прерывается при навигации */}
          <audio
            ref={audioRef}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={handleEnded}
            preload="metadata"
          />
          {current && !showFull && (
            <MiniPlayer
              current={current} playing={playing} time={time} duration={duration}
              repeat={repeat} shuffle={shuffle}
              toggle={toggle} next={next} prev={prev}
              cycleRepeat={cycleRepeat} toggleShuffle={toggleShuffle}
              onExpand={() => setShowFull(true)} onClose={closePlayer}
            />
          )}
          {current && showFull && (
            <FullPlayer
              current={current} queue={queue} index={index}
              playing={playing} time={time} duration={duration} volume={volume}
              repeat={repeat} shuffle={shuffle}
              toggle={toggle} next={next} prev={prev} seek={seek}
              setVolume={setVolume} jumpTo={jumpTo}
              cycleRepeat={cycleRepeat} toggleShuffle={toggleShuffle}
              onCollapse={() => setShowFull(false)} onClose={closePlayer}
            />
          )}
          <div className="toast-wrap">
            {toasts.map((t) => (
              <div key={t.id} className={`toast${t.err ? " err" : ""}`}>{t.text}</div>
            ))}
          </div>
        </PlayerContext.Provider>
      </ThemeContext.Provider>
    </ToastCtx.Provider>
  );
}

/* ---------------- Мини-плеер ---------------- */
function MiniPlayer(p: {
  current: Track; playing: boolean; time: number; duration: number;
  repeat: RepeatMode; shuffle: boolean;
  toggle: () => void; next: () => void; prev: () => void;
  cycleRepeat: () => void; toggleShuffle: () => void;
  onExpand: () => void; onClose: () => void;
}) {
  const pct = p.duration ? (p.time / p.duration) * 100 : 0;
  return (
    <div className="miniplayer">
      <button className="btn btn-icon btn-ghost" onClick={p.toggle} title={p.playing ? "Пауза" : "Играть"}>
        {p.playing ? <Pause size={19} /> : <Play size={19} />}
      </button>
      <div className="eq-bars" data-hidden={!p.playing} style={p.playing ? {} : { opacity: 0.35 }}>
        <span /><span /><span />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={p.onExpand}>
        <div className="text-sm font-semibold truncate">{p.current.name}</div>
        <div className="text-xs muted">
          {fmtTime(p.time)} / {fmtTime(p.duration)}
        </div>
      </div>
      <div className="hidden sm:block flex-1 max-w-52">
        <div className="h-1 rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 20%, transparent)" }}>
          <div
            className="h-1 rounded-full"
            style={{ width: `${pct}%`, background: "var(--accent)" }}
          />
        </div>
      </div>
      <button className="btn btn-icon btn-ghost" onClick={p.next} title="Следующий">
        <SkipForward size={17} />
      </button>
      <button
        className={`btn btn-icon ${p.shuffle ? "btn-accent" : "btn-ghost"} max-sm:hidden`}
        onClick={p.toggleShuffle}
        title={p.shuffle ? "Перемешивание включено" : "Перемешать"}
      >
        <Shuffle size={15} />
      </button>
      <button
        className={`btn btn-icon ${p.repeat !== "off" ? "btn-accent" : "btn-ghost"} max-sm:hidden`}
        onClick={p.cycleRepeat}
        title={
          p.repeat === "off"
            ? "Повтор выключен"
            : p.repeat === "all"
              ? "Повтор плейлиста"
              : "Повтор трека"
        }
      >
        {p.repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
      </button>
      <button className="btn btn-icon btn-ghost" onClick={p.onExpand} title="Развернуть">
        <ChevronUp size={17} />
      </button>
      <button className="btn btn-icon btn-ghost" onClick={p.onClose} title="Закрыть">
        <X size={17} />
      </button>
    </div>
  );
}

/* ---------------- Полный плеер (AIMP-стиль) ---------------- */
function FullPlayer(p: {
  current: Track; queue: Track[]; index: number;
  playing: boolean; time: number; duration: number; volume: number;
  repeat: RepeatMode; shuffle: boolean;
  toggle: () => void; next: () => void; prev: () => void;
  seek: (s: number) => void; setVolume: (v: number) => void;
  jumpTo: (i: number) => void;
  cycleRepeat: () => void; toggleShuffle: () => void;
  onCollapse: () => void; onClose: () => void;
}) {
  const repeatTitle =
    p.repeat === "off"
      ? "Повтор выключен — нажмите для повтора плейлиста"
      : p.repeat === "all"
        ? "Повтор плейлиста — нажмите для повтора одного трека"
        : "Повтор одного трека — нажмите чтобы выключить";
  return (
    <div className="modal-overlay" onClick={p.onCollapse}>
      <div
        className="modal xwide"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 920 }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="row gap-3">
            <ListMusic size={20} style={{ color: "var(--accent)" }} />
            <h3 className="text-lg font-bold m-0">Проигрыватель</h3>
            <span className="chip">{p.queue.length} трек(ов)</span>
          </div>
          <div className="row gap-1">
            <button className="btn btn-icon btn-ghost" onClick={p.onCollapse} title="Свернуть">
              <ChevronUp size={18} style={{ transform: "rotate(180deg)" }} />
            </button>
            <button className="btn btn-icon btn-ghost" onClick={p.onClose} title="Закрыть плеер">
              <Trash2 size={17} />
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          {/* Управление */}
          <div>
            <div
              className="panel-flat p-8 flex flex-col items-center text-center"
              style={{
                background:
                  "radial-gradient(400px 200px at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent)",
              }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{
                  background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                }}
              >
                <Music2 size={30} style={{ color: "var(--accent)" }} />
              </div>
              <div className="text-base font-bold break-all">{p.current.name}</div>
              <div className="mt-2">
                <span className={`eq-bars${p.playing ? "" : " paused"}`}>
                  <span /><span /><span />
                </span>
              </div>
              <div className="w-full mt-6">
                <input
                  className="seek"
                  type="range"
                  min={0}
                  max={p.duration || 0}
                  step={0.1}
                  value={p.time}
                  onChange={(e) => p.seek(Number(e.target.value))}
                />
                <div className="flex justify-between text-xs muted mt-1.5">
                  <span>{fmtTime(p.time)}</span>
                  <span>{fmtTime(p.duration)}</span>
                </div>
              </div>
              <div className="row gap-3 mt-4 justify-center">
                <button
                  className={`btn btn-icon ${p.shuffle ? "btn-accent" : "btn-ghost"}`}
                  onClick={p.toggleShuffle}
                  title={p.shuffle ? "Перемешивание включено" : "Перемешать плейлист"}
                >
                  <Shuffle size={17} />
                </button>
                <button className="btn btn-icon btn-ghost" onClick={p.prev}>
                  <SkipBack size={20} />
                </button>
                <button
                  className="btn btn-accent btn-icon"
                  style={{ padding: 16, borderRadius: "50%" }}
                  onClick={p.toggle}
                >
                  {p.playing ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button className="btn btn-icon btn-ghost" onClick={p.next}>
                  <SkipForward size={20} />
                </button>
                <button
                  className={`btn btn-icon ${p.repeat !== "off" ? "btn-accent" : "btn-ghost"}`}
                  onClick={p.cycleRepeat}
                  title={repeatTitle}
                  style={{ position: "relative" }}
                >
                  {p.repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
                </button>
              </div>
              <div className="row gap-2 mt-3 justify-center text-xs muted">
                <span className="chip">
                  {p.repeat === "off"
                    ? "Без повтора"
                    : p.repeat === "all"
                      ? "Повтор плейлиста"
                      : "Повтор трека"}
                </span>
                {p.shuffle && <span className="chip chip-accent">Перемешивание</span>}
              </div>
              <div className="row gap-2 mt-5 w-56">
                <button
                  className="btn btn-icon btn-ghost"
                  onClick={() => p.setVolume(p.volume === 0 ? 0.9 : 0)}
                >
                  {p.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  className="seek"
                  type="range" min={0} max={1} step={0.01}
                  value={p.volume}
                  onChange={(e) => p.setVolume(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          {/* Плейлист */}
          <div className="panel-flat p-3 max-h-105 overflow-auto">
            {p.queue.map((t, i) => (
              <button
                key={t.url + i}
                onClick={() => p.jumpTo(i)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm truncate transition-colors"
                style={{
                  color: i === p.index ? "var(--accent)" : "var(--text)",
                  background:
                    i === p.index
                      ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                      : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "block",
                }}
              >
                <span className="muted mr-2 text-xs">{i + 1}.</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

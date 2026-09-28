"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MOBILE_BREAKPOINT,
  VIEW_COOKIE,
  VIEW_PARAM,
  detectFromViewport,
  isViewMode,
  type ViewMode,
} from "@/lib/view-mode";

interface ViewModeContextValue {
  mode: ViewMode;
  /** true — режим закреплён пользователем вручную. */
  pinned: boolean;
  setMode: (mode: ViewMode) => void;
  resetAuto: () => void;
}

const ViewModeContext = createContext<ViewModeContextValue>({
  mode: "desktop",
  pinned: false,
  setMode: () => undefined,
  resetAuto: () => undefined,
});

export const useViewMode = () => useContext(ViewModeContext);

function writeCookie(mode: ViewMode | null) {
  if (mode) {
    document.cookie = `${VIEW_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } else {
    document.cookie = `${VIEW_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

export default function ViewModeProvider({
  initialMode,
  initialPinned,
  children,
}: {
  initialMode: ViewMode;
  initialPinned: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramMode = searchParams.get(VIEW_PARAM);

  const [storedMode, setModeState] = useState<ViewMode>(initialMode);
  const [pinnedState, setPinned] = useState(initialPinned);

  // Параметр адреса — производное значение с высшим приоритетом.
  // Его не нужно копировать в state через эффект: так нет лишнего рендера.
  const urlMode: ViewMode | null = isViewMode(paramMode) ? paramMode : null;
  const mode = urlMode ?? storedMode;
  const pinned = urlMode !== null || pinnedState;

  useEffect(() => {
    if (urlMode) writeCookie(urlMode);
  }, [urlMode]);

  // Автоопределение по ширине окна, пока пользователь не закрепил режим.
  useEffect(() => {
    if (pinned) return;
    const apply = () => setModeState(detectFromViewport(window.innerWidth));
    // Первый пересчёт — в следующем кадре, не синхронно в теле эффекта.
    const frame = window.requestAnimationFrame(apply);
    const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    media.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, [pinned]);

  // Класс и атрибут на <html>: по ним работают globals.css и globals_mobile.css.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-view", mode);
    root.classList.toggle("view-mobile", mode === "mobile");
    root.classList.toggle("view-desktop", mode === "desktop");
  }, [mode]);

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next);
      setPinned(true);
      writeCookie(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set(VIEW_PARAM, next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, setModeState, setPinned],
  );

  const resetAuto = useCallback(() => {
    setPinned(false);
    writeCookie(null);
    setModeState(detectFromViewport(window.innerWidth));
    const params = new URLSearchParams(searchParams.toString());
    params.delete(VIEW_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, setModeState, setPinned]);

  const value = useMemo(
    () => ({ mode, pinned, setMode, resetAuto }),
    [mode, pinned, setMode, resetAuto],
  );

  return (
    <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>
  );
}

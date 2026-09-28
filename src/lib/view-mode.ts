/**
 * Режим отображения интерфейса.
 * Определяется автоматически по устройству, но пользователь может закрепить
 * его вручную через параметр в адресе: ?view=mobile или ?view=desktop.
 */
export type ViewMode = "desktop" | "mobile";

export const VIEW_PARAM = "view";
export const VIEW_COOKIE = "kk_view";
/** Ниже этой ширины интерфейс считается мобильным. */
export const MOBILE_BREAKPOINT = 820;

export function isViewMode(value: unknown): value is ViewMode {
  return value === "desktop" || value === "mobile";
}

/** Мобильные устройства и планшеты в книжной ориентации. */
export function detectFromUserAgent(userAgent: string): ViewMode {
  const ua = userAgent.toLowerCase();
  const mobile =
    /android|iphone|ipod|windows phone|iemobile|blackberry|bb10|opera mini|mobile safari|silk|kindle|palm|webos/.test(
      ua,
    ) || (/ipad|tablet|playbook/.test(ua) && !/macintosh/.test(ua));
  return mobile ? "mobile" : "desktop";
}

/** Определение по ширине окна — используется уже в браузере. */
export function detectFromViewport(width: number): ViewMode {
  return width <= MOBILE_BREAKPOINT ? "mobile" : "desktop";
}

/** Собирает адрес раздела с явным указанием режима. */
export function buildViewHref(pathname: string, mode: ViewMode): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${path}?${VIEW_PARAM}=${mode}`;
}

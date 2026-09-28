/** Типы для src/lib/proxy-core.mjs (общий модуль прокси). */

export interface ProxyResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  contentType: string;
  /** Тип обнаруженной проверки браузера, если страница оказалась заглушкой. */
  challenge: string | null;
}

export interface ProxyOptions {
  /** Абсолютный адрес запрашиваемой страницы. */
  target: string;
  /** Базовый адрес самого прокси, например /api/proxy или http://host:2121/proxy */
  proxyBase: string;
  method?: string;
  headers?: Headers | Record<string, string>;
  body?: ArrayBuffer | Buffer | string | null;
}

export function isAllowedTarget(rawUrl: string): boolean;
export function detectChallenge(
  html: string,
  headers?: Headers | Record<string, string>,
): string | null;
export function neutralizeNavigation(code: string): string;
export function rewriteCss(css: string, pageUrl: string, proxyBase: string): string;
export function rewriteHtml(html: string, pageUrl: string, proxyBase: string): string;
export function proxyRequest(options: ProxyOptions): Promise<ProxyResult>;

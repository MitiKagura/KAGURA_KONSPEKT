#!/usr/bin/env node
/**
 * KAGURA•KONSPEKT — обратный прокси на отдельном порту 2121.
 *
 *   [ браузер (iframe) ] --(1) хочу страницу--> [ этот прокси ]
 *                                                     |
 *                                                (2) скачивает оригинал
 *                                                     v
 *                                              [ настоящий сайт ]
 *                                                     |
 *                                                (3) HTML + заголовки
 *                                                     v
 *                                          (4) вырезает X-Frame-Options
 *                                          (5) исправляет пути в HTML
 *                                                     v
 *   [ браузер (iframe) ] <--(6) показывает сайт-- [ этот прокси ]
 *
 * Логика переписывания общая с приложением: src/lib/proxy-core.mjs.
 *
 * Доступ разрешён только вошедшему пользователю: прокси спрашивает
 * приложение (/api/auth/me), действительна ли переданная сессия.
 * Без этого получился бы открытый прокси для всей локальной сети.
 *
 * Запуск:  node proxy-2121.mjs
 * Переменные: PROXY_PORT (2121), APP_URL (http://127.0.0.1:2315)
 */
import http from "node:http";
import { proxyRequest } from "./src/lib/proxy-core.mjs";

const PORT = Number(process.env.PROXY_PORT || 2121);
const APP_URL = (process.env.APP_URL || "http://127.0.0.1:2315").replace(/\/$/, "");

/** Спрашивает приложение, принадлежит ли сессия реальному пользователю. */
async function isAuthorized(cookieHeader) {
  if (!cookieHeader) return false;
  try {
    const response = await fetch(`${APP_URL}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function sendText(res, status, text) {
  const body = Buffer.from(text, "utf8");
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.byteLength,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (requestUrl.pathname === "/health") {
      sendText(res, 200, "ok");
      return;
    }

    const target = requestUrl.searchParams.get("url");
    if (!target) {
      sendText(res, 400, "Укажите адрес: /proxy?url=https://example.com");
      return;
    }

    if (!(await isAuthorized(req.headers.cookie))) {
      sendText(res, 401, "Требуется вход в KAGURA•KONSPEKT");
      return;
    }

    // Тело запроса для форм и API-вызовов проксируемого сайта
    let body = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const proxyBase = `${requestUrl.origin}${requestUrl.pathname}`;
    const result = await proxyRequest({
      target,
      proxyBase,
      method: req.method || "GET",
      headers: req.headers,
      body,
    });

    res.writeHead(result.status, result.headers);
    res.end(result.body);
  } catch (error) {
    sendText(res, 502, `Прокси не смог получить страницу: ${error?.message || error}`);
  }
});

// Долгие ответы больших страниц не должны обрываться по таймауту
server.headersTimeout = 0;
server.requestTimeout = 0;
server.setTimeout(0);

server.listen(PORT, () => {
  console.log(`KAGURA proxy слушает 0.0.0.0:${PORT}, приложение: ${APP_URL}`);
});

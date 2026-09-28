import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { proxyRequest } from "@/lib/proxy-core.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Обратный прокси для встраивания внешних сервисов.
 *
 * Сайты вроде md2pdf.cc и kaggle.com запрещают показ в рамке заголовком
 * X-Frame-Options. Прокси скачивает страницу сам, убирает этот запрет
 * и переписывает ссылки, поэтому сервис открывается прямо в приложении.
 *
 * Доступ только для вошедшего пользователя: иначе получился бы открытый
 * прокси, которым мог бы воспользоваться кто угодно из сети.
 */
async function handle(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requestUrl = new URL(req.url);
  const target = requestUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Не указан адрес" }, { status: 400 });
  }

  try {
    // Базой должен быть АБСОЛЮТНЫЙ адрес приложения.
    // С относительным "/api/proxy" браузер внутри рамки достраивал ссылки
    // от адреса проксируемого сайта и терял порт: получалось
    // https://<ip>/api/proxy вместо http://<ip>:2315/api/proxy,
    // отсюда ERR_CONNECTION_REFUSED и вечная загрузка на телефоне.
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const host = forwardedHost || req.headers.get("host") || requestUrl.host;
    const proto = forwardedProto || requestUrl.protocol.replace(":", "");
    const origin = `${proto}://${host}`;

    const result = await proxyRequest({
      target,
      proxyBase: `${origin}/api/proxy`,
      method: req.method,
      headers: req.headers,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? null
          : Buffer.from(await req.arrayBuffer()),
    });

    return new Response(new Uint8Array(result.body), {
      status: result.status,
      headers: result.headers,
    });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 502;
    const message = error instanceof Error ? error.message : "Ошибка прокси";
    return NextResponse.json({ error: message }, { status: status || 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const HEAD = handle;

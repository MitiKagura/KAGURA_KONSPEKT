import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { detectChallenge } from "@/lib/proxy-core.mjs";

export const dynamic = "force-dynamic";

/**
 * Проверяет, разрешает ли сайт открывать себя внутри рамки.
 *
 * Запрет задаётся самим сервисом через X-Frame-Options или
 * Content-Security-Policy: frame-ancestors. Это защита от кликджекинга,
 * и обойти её на стороне браузера невозможно. Поэтому мы выясняем это
 * заранее и сразу показываем пользователю рабочую альтернативу.
 */
export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const target = new URL(req.url).searchParams.get("url") || "";
  let parsed: URL;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("протокол не поддерживается");
    }
  } catch {
    return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        // Представляемся обычным браузером: часть сайтов иначе отвечает иначе.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(9000),
    });

    // Читаем тело: по нему видно, отдаёт ли сайт страницу проверки браузера.
    // Проверку мы не обходим — она нужна, чтобы сразу предложить рабочий путь
    // вместо бесконечного цикла в рамке.
    const html = /text\/html/i.test(response.headers.get("content-type") || "")
      ? (await response.text()).slice(0, 200_000)
      : "";
    const challenge = html ? detectChallenge(html, response.headers) : null;

    const xfo = (response.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (response.headers.get("content-security-policy") || "").toLowerCase();

    const frameAncestors = csp.match(/frame-ancestors([^;]*)/)?.[1]?.trim() || "";
    const cspBlocks =
      frameAncestors.length > 0 &&
      (frameAncestors === "'none'" || frameAncestors === "'self'");
    // Полное отсутствие frame-ancestors при default-src 'none' тоже запрет.
    const defaultNone =
      /default-src\s+'none'/.test(csp) && !/frame-ancestors/.test(csp);

    const blocked =
      xfo.includes("deny") || xfo.includes("sameorigin") || cspBlocks || defaultNone;

    if (challenge) {
      return NextResponse.json({
        url: parsed.toString(),
        reachable: true,
        embeddable: false,
        challenge,
        reason:
          challenge === "recaptcha"
            ? "Сайт включает проверку браузера reCAPTCHA"
            : "Сайт включает проверку браузера перед доступом",
      });
    }

    return NextResponse.json({
      url: parsed.toString(),
      reachable: true,
      embeddable: !blocked,
      challenge: null,
      reason: blocked
        ? xfo
          ? `Сервис запрещает встраивание: X-Frame-Options ${xfo.toUpperCase()}`
          : "Сервис запрещает встраивание правилом Content-Security-Policy"
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "Сайт не ответил вовремя"
        : error instanceof Error
          ? error.message
          : "Не удалось соединиться";
    return NextResponse.json({
      url: parsed.toString(),
      reachable: false,
      embeddable: false,
      reason: `Не удалось проверить сайт: ${message}`,
    });
  }
}

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
};

/** Локальная раздача официального npm-пакета MathJax 4, без CDN. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // После rewrite Next сохраняет исходный pathname в Request — извлекаем из него
  // пакет и все сегменты без ненадёжной передачи wildcard через query.
  const fontPrefix = "/mathjax-newcm/";
  const corePrefix = "/mathjax/";
  const pkg = url.pathname.startsWith(fontPrefix) ? "font" : "core";
  const prefix = pkg === "font" ? fontPrefix : corePrefix;
  const relative = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length)
    : "";
  const segments = relative.split("/").filter(Boolean).map(decodeURIComponent);
  if (
    segments.length === 0 ||
    segments.length > 8 ||
    segments.some(
      (part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"),
    )
  ) {
    return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });
  }

  const root =
    pkg === "font"
      ? path.join(
          process.cwd(),
          "node_modules",
          "@mathjax",
          "mathjax-newcm-font",
        )
      : path.join(process.cwd(), "node_modules", "mathjax");
  const file = path.resolve(root, ...segments);
  if (!file.startsWith(path.resolve(root) + path.sep)) {
    return NextResponse.json({ error: "Недопустимый путь" }, { status: 400 });
  }
  const ext = path.extname(file).toLowerCase();
  if (!(ext in MIME)) {
    return NextResponse.json({ error: "Тип файла не разрешён" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "MathJax asset not found" }, { status: 404 });
  }
}

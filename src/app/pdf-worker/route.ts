import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Отдаёт воркер pdf.js локально (без CDN — приложение работает автономно). */
export async function GET() {
  try {
    // ВАЖНО: legacy-воркер должен соответствовать legacy-сборке pdf.js в PdfViewer,
    // иначе версии не совпадут и документ не отрисуется.
    const p = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    );
    const code = await fs.readFile(p, "utf8");
    return new Response(code, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "worker not found" },
      { status: 404 },
    );
  }
}

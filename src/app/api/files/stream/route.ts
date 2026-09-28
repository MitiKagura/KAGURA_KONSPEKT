import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { getUser } from "@/lib/auth";
import { baseFor, safeJoin, mimeOf } from "@/lib/filesys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Потоковая раздача медиа с поддержкой HTTP Range (перемотка аудио/видео). */
export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") || "";
  try {
    const abs = safeJoin(baseFor(me), rel);
    const st = await fs.stat(abs);
    if (st.isDirectory()) {
      return NextResponse.json({ error: "Это папка" }, { status: 400 });
    }
    const ext = path.extname(abs).slice(1);
    const mime = mimeOf(ext);
    const range = req.headers.get("range");
    const common = {
      "Accept-Ranges": "bytes",
      "Content-Type": mime,
      "Cache-Control": "no-cache",
    };
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= st.size) end = st.size - 1;
      if (start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${st.size}` },
        });
      }
      const stream = createReadStream(abs, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...common,
          "Content-Range": `bytes ${start}-${end}/${st.size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
    const stream = createReadStream(abs);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: { ...common, "Content-Length": String(st.size) },
    });
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
}

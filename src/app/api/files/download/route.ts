import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { getUser } from "@/lib/auth";
import { baseFor, safeJoin, mimeOf } from "@/lib/filesys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const name = path.basename(abs);
    const ext = path.extname(name).slice(1);
    const stream = createReadStream(abs);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": mimeOf(ext),
        "Content-Length": String(st.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
}

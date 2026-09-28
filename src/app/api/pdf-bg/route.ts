import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getUser } from "@/lib/auth";
import { filesRoot, ensureUserFolder } from "@/lib/filesys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const userDir = path.join(filesRoot(), me.username);

  // Возвращает список страниц, для которых загружены фоны (например: ["all", "1", "3"])
  if (action === "list") {
    try {
      const files = await fs.readdir(userDir);
      const pages = files
        .filter((f) => f.startsWith(".pdf_bg_"))
        .map((f) => f.replace(".pdf_bg_", "").split(".")[0]);
      return NextResponse.json({ pages });
    } catch {
      return NextResponse.json({ pages: [] });
    }
  }

  const page = url.searchParams.get("page") || "all";
  const safePage = page === "all" ? "all" : parseInt(page, 10).toString();
  const prefix = `.pdf_bg_${safePage}.`;

  try {
    const files = await fs.readdir(userDir);
    const target = files.find((f) => f.startsWith(prefix));
    if (!target) return new Response(null, { status: 204 });

    const ext = path.extname(target).slice(1).toLowerCase();
    const buf = await fs.readFile(path.join(userDir, target));
    
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": ALLOWED[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new Response(null, { status: 204 });
  }
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
  const url = new URL(req.url);
  const page = url.searchParams.get("page") || "all";
  const safePage = page === "all" ? "all" : parseInt(page, 10).toString();
  
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  
  const ext = path.extname(file.name).slice(1).toLowerCase();
  if (!ALLOWED[ext]) {
    return NextResponse.json(
      { error: "Поддерживаются только JPG, PNG и WebP" },
      { status: 400 },
    );
  }
  
  await ensureUserFolder(me.username);
  const userDir = path.join(filesRoot(), me.username);
  
  // Удаляем старые фоны для этой страницы перед сохранением нового
  try {
    const files = await fs.readdir(userDir);
    const prefix = `.pdf_bg_${safePage}.`;
    for (const f of files) {
      if (f.startsWith(prefix)) await fs.rm(path.join(userDir, f));
    }
  } catch { /* ignore */ }

  const p = path.join(userDir, `.pdf_bg_${safePage}.${ext}`);
  await fs.writeFile(p, Buffer.from(await file.arrayBuffer()));
  
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  
  const url = new URL(req.url);
  const page = url.searchParams.get("page") || "all";
  const safePage = page === "all" ? "all" : parseInt(page, 10).toString();
  
  const userDir = path.join(filesRoot(), me.username);
  
  try {
    const files = await fs.readdir(userDir);
    const prefix = `.pdf_bg_${safePage}.`;
    for (const f of files) {
      if (f.startsWith(prefix)) await fs.rm(path.join(userDir, f));
    }
  } catch { /* ignore */ }
  
  return NextResponse.json({ ok: true });
}

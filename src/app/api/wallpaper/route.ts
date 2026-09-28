import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
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

async function getExt(userId: number) {
  const [s] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return s?.wallpaperExt || null;
}

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ext = await getExt(me.id);
  // 204 (а не 404) — «обоев нет», чтобы не засорять консоль браузера ошибками
  if (!ext || !ALLOWED[ext]) {
    return new Response(null, { status: 204 });
  }
  try {
    const p = path.join(filesRoot(), me.username, `.wallpaper.${ext}`);
    const buf = await fs.readFile(p);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": ALLOWED[ext],
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
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Файл больше 15 МБ" }, { status: 400 });
  }
  await ensureUserFolder(me.username);
  const p = path.join(filesRoot(), me.username, `.wallpaper.${ext}`);
  await fs.writeFile(p, Buffer.from(await file.arrayBuffer()));
  await db
    .insert(userSettings)
    .values({ userId: me.id, wallpaperExt: ext })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { wallpaperExt: ext },
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ext = await getExt(me.id);
  if (ext) {
    try {
      await fs.rm(path.join(filesRoot(), me.username, `.wallpaper.${ext}`));
    } catch {
      /* ignore */
    }
  }
  await db
    .insert(userSettings)
    .values({ userId: me.id, wallpaperExt: null })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { wallpaperExt: null },
    });
  return NextResponse.json({ ok: true });
}

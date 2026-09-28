import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getUser } from "@/lib/auth";
import { baseFor, safeJoin, sanitizeName, FsError } from "@/lib/filesys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const base = baseFor(me);
    const form = await req.formData();
    const rel = String(form.get("path") || "");
    const dir = safeJoin(base, rel);
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
    }
    const saved: string[] = [];
    for (const file of files) {
      const name = sanitizeName(file.name);
      const target = path.join(dir, name);
      // Не затираем существующий файл молча — добавляем (1), (2)...
      let finalName = name;
      let i = 1;
      while (true) {
        try {
          await fs.access(path.join(dir, finalName));
          const ext = path.extname(name);
          finalName = `${name.slice(0, name.length - ext.length)} (${i})${ext}`;
          i++;
        } catch {
          break;
        }
      }
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(path.join(dir, finalName), buf);
      saved.push(finalName);
    }
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    if (e instanceof FsError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}

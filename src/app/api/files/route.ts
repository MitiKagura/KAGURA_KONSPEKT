import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getUser } from "@/lib/auth";
import {
  baseFor,
  ensureUserFolder,
  ensureRoot,
  listDir,
  safeJoin,
  sanitizeName,
  searchFiles,
  FsError,
} from "@/lib/filesys";

export const dynamic = "force-dynamic";

function err(e: unknown) {
  if (e instanceof FsError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Ошибка файловой системы" },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await ensureRoot();
    await ensureUserFolder(me.username);
    const base = baseFor(me);
    const url = new URL(req.url);
    const search = (url.searchParams.get("search") || "").trim();
    if (search) {
      const entries = await searchFiles(base, search);
      return NextResponse.json({ entries, search });
    }
    const rel = url.searchParams.get("path") || "";
    const entries = await listDir(base, rel);
    // Информация о пользовательских папках для админа в корне
    return NextResponse.json({ entries, path: rel });
  } catch (e) {
    return err(e);
  }
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const base = baseFor(me);
    const body = (await req.json()) as {
      action?: string;
      path?: string;
      name?: string;
    };
    if (body.action === "mkdir") {
      const name = sanitizeName(body.name || "");
      const parent = safeJoin(base, body.path || "");
      await fs.mkdir(path.join(parent, name), { recursive: false });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "rename") {
      const name = sanitizeName(body.name || "");
      const abs = safeJoin(base, body.path || "");
      await fs.rename(abs, path.join(path.dirname(abs), name));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return err(e);
  }
}

export async function DELETE(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const base = baseFor(me);
    const body = (await req.json()) as { path?: string };
    const rel = body.path || "";
    if (!rel) {
      return NextResponse.json(
        { error: "Нельзя удалить корневую папку" },
        { status: 400 },
      );
    }
    const abs = safeJoin(base, rel);
    // Защита: нельзя удалить папку пользователя из-под админа через общий delete —
    // разрешаем (админ = root-доступ), но только не сам base.
    if (abs === path.resolve(base)) {
      return NextResponse.json({ error: "Нельзя удалить корень" }, { status: 400 });
    }
    await fs.rm(abs, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return err(e);
  }
}

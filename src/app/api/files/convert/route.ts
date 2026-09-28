import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { getUser } from "@/lib/auth";
import { baseFor, safeJoin, OFFICE_EXTS } from "@/lib/filesys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileP = promisify(execFile);

async function findSoffice(): Promise<string | null> {
  for (const bin of ["soffice", "libreoffice"]) {
    try {
      await execFileP("which", [bin]);
      return bin;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Конвертация офисных документов (doc/docx/xls/xlsx/ppt/pptx/odt/ods/odp и т.д.) в PDF через LibreOffice. */
export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { path?: string };
  const rel = body.path || "";
  try {
    const abs = safeJoin(baseFor(me), rel);
    const st = await fs.stat(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (!OFFICE_EXTS.includes(ext)) {
      return NextResponse.json({ error: "Формат не поддерживается" }, { status: 400 });
    }
    const soffice = await findSoffice();
    if (!soffice) {
      return NextResponse.json(
        {
          error:
            "LibreOffice не установлен на сервере. Установите libreoffice-fresh — файл можно скачать.",
        },
        { status: 501 },
      );
    }
    const base = baseFor(me);
    const cacheDir = path.join(base, ".cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const hash = crypto
      .createHash("sha1")
      .update(`${rel}:${st.size}:${st.mtimeMs}`)
      .digest("hex");
    const cached = path.join(cacheDir, `${hash}.pdf`);
    try {
      await fs.access(cached);
      return NextResponse.json({ pdf: `.cache/${hash}.pdf`, cached: true });
    } catch {
      /* not cached */
    }
    await execFileP(
      soffice,
      ["--headless", "--convert-to", "pdf", "--outdir", cacheDir, abs],
      { timeout: 180000 },
    );
    const produced = path.join(
      cacheDir,
      path.basename(abs, path.extname(abs)) + ".pdf",
    );
    await fs.rename(produced, cached).catch(async () => {
      // иногда soffice возвращает неочевидное имя — найдём свежий pdf
      const files = await fs.readdir(cacheDir);
      const candidate = files
        .filter((f) => f.endsWith(".pdf") && f !== `${hash}.pdf`)
        .sort()
        .pop();
      if (candidate) await fs.rename(path.join(cacheDir, candidate), cached);
    });
    await fs.access(cached);
    return NextResponse.json({ pdf: `.cache/${hash}.pdf`, cached: false });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Конвертация не удалась: ${e.message}`
            : "Конвертация не удалась",
      },
      { status: 500 },
    );
  }
}

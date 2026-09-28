import { NextResponse } from "next/server";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULT_MD2PDF = "https://md2pdf.cc/";

/**
 * Разрешаем только http/https. Иначе можно было бы подставить javascript:
 * или data: и получить исполнение произвольного кода во встроенном окне.
 */
function sanitizeUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, me.id));
  return NextResponse.json({
    settings: {
      weekParityFlip: row?.weekParityFlip ?? false,
      wallpaperExt: row?.wallpaperExt ?? null,
      md2pdfMode: row?.md2pdfMode === "site" ? "site" : "system",
      md2pdfUrl: row?.md2pdfUrl ?? DEFAULT_MD2PDF,
      ttsUrl: row?.ttsUrl ?? "",
      pdfBgConfig: row?.pdfBgConfig ?? "{}",
    },
  });
}

export async function PATCH(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    weekParityFlip?: boolean;
    md2pdfMode?: string;
    md2pdfUrl?: string;
    ttsUrl?: string;
    pdfBgConfig?: string;
  };

  const patch: {
    weekParityFlip?: boolean;
    md2pdfMode?: string;
    md2pdfUrl?: string;
    ttsUrl?: string;
    pdfBgConfig?: string;
  } = {};

  if (typeof body.weekParityFlip === "boolean") {
    patch.weekParityFlip = body.weekParityFlip;
  }
  if (typeof body.md2pdfMode === "string") {
    if (body.md2pdfMode !== "system" && body.md2pdfMode !== "site") {
      return NextResponse.json(
        { error: "Режим MD2PDF должен быть system или site" },
        { status: 400 },
      );
    }
    patch.md2pdfMode = body.md2pdfMode;
  }
  if (typeof body.md2pdfUrl === "string") {
    const clean = sanitizeUrl(body.md2pdfUrl);
    if (clean === null) {
      return NextResponse.json(
        { error: "Некорректная ссылка на конвертер MD → PDF" },
        { status: 400 },
      );
    }
    patch.md2pdfUrl = clean || DEFAULT_MD2PDF;
  }
  if (typeof body.ttsUrl === "string") {
    const clean = sanitizeUrl(body.ttsUrl);
    if (clean === null) {
      return NextResponse.json(
        { error: "Некорректная ссылка на сервис озвучки" },
        { status: 400 },
      );
    }
    patch.ttsUrl = clean;
  }
  if (typeof body.pdfBgConfig === "string") {
    patch.pdfBgConfig = body.pdfBgConfig;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нет данных для сохранения" }, { status: 400 });
  }

  await db
    .insert(userSettings)
    .values({ userId: me.id, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch });

  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, me.id));
  return NextResponse.json({
    ok: true,
    settings: {
      weekParityFlip: row?.weekParityFlip ?? false,
      md2pdfMode: row?.md2pdfMode === "site" ? "site" : "system",
      md2pdfUrl: row?.md2pdfUrl ?? DEFAULT_MD2PDF,
      ttsUrl: row?.ttsUrl ?? "",
      pdfBgConfig: row?.pdfBgConfig ?? "{}",
    },
  });
}

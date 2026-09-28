import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { SessionUser } from "@/lib/auth";

export function filesRoot() {
  const root = process.env.FILES_ROOT || "./data/files";
  return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
}

export async function ensureRoot() {
  await fs.mkdir(filesRoot(), { recursive: true });
}

export async function ensureUserFolder(username: string) {
  await ensureRoot();
  await fs.mkdir(path.join(filesRoot(), username), { recursive: true });
}

/** Базовая папка для пользователя: админ видит весь root, обычный пользователь — свою папку. */
export function baseFor(user: SessionUser) {
  return user.role === "admin"
    ? filesRoot()
    : path.join(filesRoot(), user.username);
}

export class FsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Безопасное соединение относительного пути с базой (защита от path traversal). */
export function safeJoin(base: string, rel: string) {
  const clean = (rel || "").replace(/^[/\\]+/, "");
  const resolved = path.resolve(base, clean);
  const normBase = path.resolve(base);
  if (resolved !== normBase && !resolved.startsWith(normBase + path.sep)) {
    throw new FsError("Недопустимый путь", 400);
  }
  return resolved;
}

export function sanitizeName(name: string) {
  const n = (name || "")
    .replace(/[/\\\0]/g, "")
    .replace(/^\.+$/, "")
    .trim();
  if (!n) throw new FsError("Пустое имя", 400);
  return n;
}

export interface FileEntry {
  name: string;
  rel: string;
  isDir: boolean;
  size: number;
  mtime: number;
  ext: string;
}

export async function listDir(base: string, rel: string): Promise<FileEntry[]> {
  const abs = safeJoin(base, rel);
  let items;
  try {
    items = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    throw new FsError("Папка не найдена", 404);
  }
  const out: FileEntry[] = [];
  for (const it of items) {
    if (it.name.startsWith(".")) continue; // скрываем служебные файлы
    const p = path.join(abs, it.name);
    try {
      const st = await fs.stat(p);
      out.push({
        name: it.name,
        rel: rel ? `${rel}/${it.name}` : it.name,
        isDir: it.isDirectory(),
        size: st.size,
        mtime: st.mtimeMs,
        ext: it.isDirectory() ? "" : path.extname(it.name).slice(1).toLowerCase(),
      });
    } catch {
      /* ignore */
    }
  }
  out.sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name, "ru") : a.isDir ? -1 : 1,
  );
  return out;
}

export async function searchFiles(
  base: string,
  query: string,
  max = 300,
): Promise<FileEntry[]> {
  const q = query.toLowerCase();
  const out: FileEntry[] = [];
  async function walk(rel: string, depth: number) {
    if (depth > 8 || out.length >= max) return;
    let items;
    try {
      items = await fs.readdir(safeJoin(base, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      if (out.length >= max) return;
      if (it.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${it.name}` : it.name;
      const p = safeJoin(base, childRel);
      try {
        const st = await fs.stat(p);
        if (it.name.toLowerCase().includes(q)) {
          out.push({
            name: it.name,
            rel: childRel,
            isDir: it.isDirectory(),
            size: st.size,
            mtime: st.mtimeMs,
            ext: it.isDirectory()
              ? ""
              : path.extname(it.name).slice(1).toLowerCase(),
          });
        }
        if (it.isDirectory()) await walk(childRel, depth + 1);
      } catch {
        /* ignore */
      }
    }
  }
  await walk("", 0);
  return out;
}

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  m4v: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json",
  csv: "text/csv; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  zip: "application/zip",
};

export function mimeOf(ext: string) {
  return MIME[ext.toLowerCase()] || "application/octet-stream";
}

export const AUDIO_EXTS = ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus"];
export const VIDEO_EXTS = ["mp4", "webm", "mkv", "avi", "mov", "m4v"];
export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
export const OFFICE_EXTS = [
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf", "vsd", "vsdx", "pub", "pages", "numbers", "key",
];

export function fileKind(ext: string): string {
  const e = ext.toLowerCase();
  if (AUDIO_EXTS.includes(e)) return "audio";
  if (VIDEO_EXTS.includes(e)) return "video";
  if (IMAGE_EXTS.includes(e)) return "image";
  if (e === "pdf") return "pdf";
  if (OFFICE_EXTS.includes(e)) return "office";
  if (["md", "markdown"].includes(e)) return "markdown";
  if (["txt", "log", "json", "csv", "xml", "yaml", "yml"].includes(e)) return "text";
  return "other";
}

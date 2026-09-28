"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Home as HomeIcon,
  Image as ImageIcon,
  ListMusic,
  Music,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Sheet,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { Confirm, EmptyState, Modal, Spinner } from "@/components/ui";
import { usePlayer, useToast } from "@/components/providers";
import {
  VideoPlayer,
  PdfViewer,
  OfficeViewer,
  TextViewer,
  streamUrl,
  downloadUrl,
} from "@/components/media-viewers";

interface Entry {
  name: string; rel: string; isDir: boolean; size: number; mtime: number; ext: string;
}

const AUDIO = ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus"];
const VIDEO = ["mp4", "webm", "mkv", "avi", "mov", "m4v"];
const IMAGE = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];

function kindOf(e: Entry) {
  const x = e.ext;
  if (e.isDir) return "dir";
  if (AUDIO.includes(x)) return "audio";
  if (VIDEO.includes(x)) return "video";
  if (IMAGE.includes(x)) return "image";
  if (x === "pdf") return "pdf";
  if (OFFICE.includes(x)) return "office";
  if (x === "md" || x === "markdown") return "markdown";
  if (["txt", "log", "json", "csv", "xml", "yaml", "yml"].includes(x)) return "text";
  return "other";
}

function iconOf(e: Entry) {
  const k = kindOf(e);
  const s = { size: 20 };
  switch (k) {
    case "dir": return <Folder {...s} />;
    case "audio": return <Music {...s} />;
    case "video": return <Video {...s} />;
    case "image": return <ImageIcon {...s} />;
    case "markdown": case "text": return <FileText {...s} />;
    case "pdf": return <FileText {...s} />;
    case "office":
      if (["xls", "xlsx", "ods"].includes(e.ext)) return <Sheet {...s} />;
      if (["ppt", "pptx", "odp"].includes(e.ext)) return <Presentation {...s} />;
      return <FileText {...s} />;
    default: return <File {...s} />;
  }
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} КБ`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} МБ`;
  return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
}

export default function FilesPage() {
  const toast = useToast();
  const player = usePlayer();
  const [segments, setSegments] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewer, setViewer] = useState<{ kind: string; rel: string; name: string } | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [renameOf, setRenameOf] = useState<Entry | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [deleteOf, setDeleteOf] = useState<Entry | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const crumbsRef = useRef<HTMLDivElement>(null);

  const rel = segments.join("/");

  const load = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setEntries(data.entries);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка загрузки", true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(rel);
  }, [rel, load]);

  // При углублении в подпапки прокручиваем крошки к концу пути,
  // чтобы текущая папка всегда была видна.
  useEffect(() => {
    const node = crumbsRef.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [rel]);

  async function doSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/files?search=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSearchResults(data.entries);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка поиска", true);
    } finally {
      setSearching(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("path", rel);
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch("/api/files/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.push(`Загружено: ${data.saved.length} файл(ов)`);
      load(rel);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка загрузки", true);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function mkdir() {
    if (!newFolder.trim()) return;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mkdir", path: rel, name: newFolder.trim() }),
    });
    if (!res.ok) {
      toast.push((await res.json()).error || "Ошибка", true);
      return;
    }
    setMkdirOpen(false);
    setNewFolder("");
    load(rel);
  }

  async function doRename() {
    if (!renameOf || !renameVal.trim()) return;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", path: renameOf.rel, name: renameVal.trim() }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Ошибка переименования");
    setRenameOf(null);
    load(rel);
  }

  async function doDelete(e: Entry) {
    const res = await fetch("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: e.rel }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Ошибка удаления");
    toast.push(`Удалено: ${e.name}`);
    if (searchResults) doSearch(query);
    load(rel);
  }

  function openEntry(e: Entry) {
    if (e.isDir) {
      setSearchResults(null);
      setQuery("");
      setSegments(e.rel.split("/"));
      return;
    }
    const k = kindOf(e);
    if (k === "audio") {
      const audioList = (searchResults ?? entries).filter((x) => kindOf(x) === "audio")
        .map((x) => ({ name: x.name, url: streamUrl(x.rel) }));
      player.playTrack({ name: e.name, url: streamUrl(e.rel) }, audioList);
      return;
    }
    if (["video", "pdf", "office", "image", "markdown", "text"].includes(k)) {
      setViewer({ kind: k, rel: e.rel, name: e.name });
    }
  }

  function playAllAudio() {
    const list = entries.filter((x) => kindOf(x) === "audio");
    if (!list.length) return;
    player.playTrack(
      { name: list[0].name, url: streamUrl(list[0].rel) },
      list.map((x) => ({ name: x.name, url: streamUrl(x.rel) })),
    );
    toast.push(`В плейлист добавлено ${list.length} трек(ов)`);
  }

  const shown = searchResults ?? entries;
  const audioCount = entries.filter((x) => kindOf(x) === "audio").length;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
      }}
    >
      <header className="page-hero anim-in">
        <h1 className="page-title">Файлы</h1>
        <p className="page-sub">Файловый менеджер · корень: /srv/KAGURA_KONSPEKT</p>
      </header>

      {/* Панель инструментов */}
      <div className="panel p-4 mb-4 anim-in anim-in-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="row gap-2 flex-1 min-w-56">
            <Search size={17} className="muted shrink-0" />
            <input
              className="input !border-0 !bg-transparent !p-1.5"
              style={{ boxShadow: "none" }}
              placeholder="Поиск по названию файла…"
              value={query}
              onChange={(e) => doSearch(e.target.value)}
            />
            {query && (
              <button className="btn btn-icon btn-ghost" onClick={() => doSearch("")}>
                <X size={15} />
              </button>
            )}
            {searching && <Spinner size={15} />}
          </div>
          {audioCount > 0 && !searchResults && (
            <button className="btn" onClick={playAllAudio}>
              <ListMusic size={15} /> Слушать всё ({audioCount})
            </button>
          )}
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <Upload size={15} />} Загрузить
          </button>
          <button className="btn" onClick={() => setMkdirOpen(true)}>
            <FolderPlus size={15} /> Папка
          </button>
          <button className="btn btn-icon" onClick={() => (searchResults ? doSearch(query) : load(rel))} title="Обновить">
            <RefreshCw size={15} />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>

        {/* Хлебные крошки */}
        {!searchResults && (
          <div ref={crumbsRef} className="row flex-wrap gap-1 mt-3 text-sm files-crumbs">
            <button
              className="btn btn-ghost !px-2 !py-1"
              onClick={() => setSegments([])}
            >
              <HardDrive size={15} />
              root
            </button>
            {segments.map((s, i) => (
              <React.Fragment key={i}>
                <ChevronRight size={13} className="muted" />
                <button
                  className="btn btn-ghost !px-2 !py-1"
                  onClick={() => setSegments(segments.slice(0, i + 1))}
                >
                  {s}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
        {searchResults && (
          <div className="mt-3 text-sm muted">
            Найдено по запросу «{query}»: {searchResults.length}
          </div>
        )}
      </div>

      {/* Листинг */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={30} /></div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<HomeIcon size={34} />}
          title={searchResults ? "Ничего не найдено" : "Папка пуста"}
          hint={searchResults ? "Попробуйте другой запрос" : "Загрузите файлы или создайте папку — можно просто перетащить их в окно"}
        />
      ) : (
        <div className="grid gap-2 anim-in anim-in-2">
          {shown.map((e) => {
            const k = kindOf(e);
            const active = player.current?.url === streamUrl(e.rel);
            return (
              <div
                key={e.rel}
                className="card px-4 py-3 row gap-3 cursor-pointer"
                style={active ? { borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" } : {}}
                onClick={() => {
                  if (searchResults && e.isDir) {
                    setSegments(e.rel.split("/"));
                    setSearchResults(null);
                    setQuery("");
                  } else openEntry(e);
                }}
              >
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                  }}
                >
                  {iconOf(e)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-2">
                    {e.name}
                    {active && (
                      <span className="eq-bars" style={{ transform: "scale(0.75)" }}>
                        <span /><span /><span />
                      </span>
                    )}
                  </div>
                  <div className="text-xs muted truncate">
                    {searchResults ? e.rel : e.isDir ? "Папка" : fmtSize(e.size)}
                    {" · "}
                    {new Date(e.mtime).toLocaleDateString("ru-RU")}
                  </div>
                </div>
                <div className="row gap-0.5" onClick={(ev) => ev.stopPropagation()}>
                  {!e.isDir && (
                    <a
                      className="btn btn-icon btn-ghost"
                      href={downloadUrl(e.rel)}
                      download
                      title="Скачать"
                    >
                      <Download size={16} />
                    </a>
                  )}
                  <button
                    className="btn btn-icon btn-ghost"
                    title="Переименовать"
                    onClick={() => {
                      setRenameOf(e);
                      setRenameVal(e.name);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn btn-icon btn-ghost hover:!text-red-400"
                    title="Удалить"
                    onClick={() => setDeleteOf(e)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drag&drop оверлей */}
      {dragOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "color-mix(in srgb, var(--accent) 10%, rgba(4,6,10,0.6))" }}
        >
          <div className="panel p-10 text-center" style={{ borderStyle: "dashed", borderWidth: 2, borderColor: "var(--accent)" }}>
            <Plus size={40} style={{ color: "var(--accent)" }} className="mx-auto mb-3" />
            <div className="font-bold text-lg">Отпустите, чтобы загрузить</div>
            <div className="text-sm muted">в папку {rel || "root"}</div>
          </div>
        </div>
      )}

      {/* Просмотр медиа */}
      <Modal
        open={!!viewer}
        onClose={() => setViewer(null)}
        title={
          <span className="row gap-2">
            {viewer && iconOf({ ...({} as Entry), name: viewer.name, ext: viewer.name.split(".").pop() || "", isDir: false, rel: "", size: 0, mtime: 0 })}
            <span className="truncate">{viewer?.name}</span>
            {viewer && (
              <a className="btn btn-icon btn-ghost ml-2" href={downloadUrl(viewer.rel)} download title="Скачать">
                <Download size={16} />
              </a>
            )}
          </span>
        }
        size={viewer && ["video", "pdf", "office", "markdown", "text", "image"].includes(viewer.kind) ? "xwide" : undefined}
      >
        {viewer?.kind === "video" && (
          <VideoPlayer
            src={streamUrl(viewer.rel)}
            title={viewer.name}
            onClose={() => setViewer(null)}
          />
        )}
        {viewer?.kind === "pdf" && <PdfViewer url={streamUrl(viewer.rel)} />}
        {viewer?.kind === "office" && <OfficeViewer rel={viewer.rel} />}
        {viewer?.kind === "image" && (
          <div className="reader-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={streamUrl(viewer.rel)} alt={viewer.name} />
          </div>
        )}
        {(viewer?.kind === "markdown" || viewer?.kind === "text") && (
          <TextViewer rel={viewer.rel} kind={viewer.kind} />
        )}
      </Modal>

      {/* Создать папку */}
      <Modal open={mkdirOpen} onClose={() => setMkdirOpen(false)} title="Новая папка">
        <input
          className="input"
          placeholder="Название папки…"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && mkdir()}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="btn" onClick={() => setMkdirOpen(false)}>Отмена</button>
          <button className="btn btn-accent" onClick={mkdir} disabled={!newFolder.trim()}>
            Создать
          </button>
        </div>
      </Modal>

      {/* Переименовать */}
      <Modal open={!!renameOf} onClose={() => setRenameOf(null)} title={`Переименовать «${renameOf?.name}»`}>
        <input
          className="input"
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              try { await doRename(); } catch (err) { toast.push(err instanceof Error ? err.message : "Ошибка", true); }
            }
          }}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="btn" onClick={() => setRenameOf(null)}>Отмена</button>
          <button
            className="btn btn-accent"
            disabled={!renameVal.trim()}
            onClick={async () => {
              try { await doRename(); } catch (err) { toast.push(err instanceof Error ? err.message : "Ошибка", true); }
            }}
          >
            Сохранить
          </button>
        </div>
      </Modal>

      {/* Удаление */}
      <Confirm
        open={!!deleteOf}
        onClose={() => setDeleteOf(null)}
        title={`Удалить ${deleteOf?.isDir ? "папку" : "файл"}?`}
        what={`«${deleteOf?.name}»${deleteOf?.isDir ? " и всё её содержимое" : ""} будет удалено безвозвратно.`}
        onConfirm={() => doDelete(deleteOf!)}
      />
    </div>
  );
}

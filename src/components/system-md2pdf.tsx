"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  BookOpenText,
  ChevronDown,
  FileText,
  FolderOpen,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  Maximize,
  Minimize,
} from "lucide-react";
import {
  MarkdownView,
  renderMermaidBlocks,
} from "@/components/markdown";
import { EmptyState, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";

interface Note { id: number; subjectId: number; title: string; content: string; updatedAt: string; }
interface Subject { id: number; name: string; }
interface TableConfig { width: number; fontSize: number; columns: string; }

const DEFAULT_TABLE: TableConfig = { width: 100, fontSize: 10, columns: "" };

export interface BgSettings {
  fit: "cover" | "contain"; // Заменили width/height на нативный object-fit
  x: number; // 0-100%
  y: number; // 0-100%
  opacity: number;
}
export interface BgConfig {
  mode: "all" | "per_page";
  all: BgSettings;
  pages: Record<number, BgSettings>;
}

const DEFAULT_BG: BgSettings = { fit: "cover", x: 50, y: 50, opacity: 0.15 };
const DEFAULT_BG_CONFIG: BgConfig = { mode: "all", all: { ...DEFAULT_BG }, pages: {} };

function getPageHeightMm(format: "A4" | "A3", orientation: "portrait" | "landscape") {
  if (format === "A4") return orientation === "portrait" ? 297 : 210;
  if (format === "A3") return orientation === "portrait" ? 420 : 297;
  return 297;
}

// Мемоизированный компонент предотвращает рябь MathJax при изменении внешних стейтов (настроек)
const StaticMarkdown = React.memo(({ source, onReady }: { source: string, onReady: () => void }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!rootRef.current) return;
    void renderMermaidBlocks(rootRef.current);
    const timer = setTimeout(onReady, 200);
    return () => clearTimeout(timer);
  }, [source, onReady]);

  return <div ref={rootRef}><MarkdownView source={source} debounceMs={0} /></div>;
}, (prev, next) => prev.source === next.source);
StaticMarkdown.displayName = "StaticMarkdown";


export default function SystemMd2Pdf() {
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [tableCount, setTableCount] = useState(0);
  const [tableLabels, setTableLabels] = useState<string[]>([]);
  const [tables, setTables] = useState<Record<number, TableConfig>>({});
  const [format, setFormat] = useState<"A4" | "A3">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  
  const [showGlow, setShowGlow] = useState(true);
  const [showTables, setShowTables] = useState(false);

  const [totalPages, setTotalPages] = useState(1);
  const [bgConfig, setBgConfig] = useState<BgConfig>(DEFAULT_BG_CONFIG);
  const [bgPageScope, setBgPageScope] = useState<number | "all">("all");
  const [availableBgs, setAvailableBgs] = useState<string[]>([]);
  
  const contentRef = useRef<HTMLTableSectionElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const checkPdfBg = useCallback(async () => {
    try {
      const r = await fetch("/api/pdf-bg?action=list");
      if (r.ok) {
        const data = await r.json();
        setAvailableBgs(data.pages || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [noteData, subjectData, settingsRes] = await Promise.all([
          fetch("/api/notes").then((r) => r.json()),
          fetch("/api/subjects").then((r) => r.json()),
          fetch("/api/settings").then((r) => r.json()),
        ]);
        const allNotes: Note[] = noteData.notes || [];
        setNotes(allNotes);
        setSubjects(subjectData.subjects || []);
        if (allNotes.length) setSelectedId(allNotes[0].id);
        
        if (settingsRes?.settings?.pdfBgConfig) {
          try {
            const p = JSON.parse(settingsRes.settings.pdfBgConfig);
            if (p.mode) setBgConfig(p);
          } catch { /* ignore */ }
        }
      } catch {
        toast.push("Не удалось загрузить данные", true);
      } finally {
        setLoading(false);
      }
      checkPdfBg();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBgConfig: JSON.stringify(bgConfig) }),
      }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [bgConfig]);

  const handleBgUpload = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    const page = bgConfig.mode === "all" ? "all" : String(bgPageScope);
    const r = await fetch(`/api/pdf-bg?page=${page}`, { method: "POST", body: fd });
    if (r.ok) {
      toast.push(`Фон загружен (${bgConfig.mode === "all" ? "для всех страниц" : `для стр. ${page}`})`);
      checkPdfBg();
    } else {
      toast.push("Ошибка загрузки фона", true);
    }
  };

  const removeBg = async () => {
    const page = bgConfig.mode === "all" ? "all" : String(bgPageScope);
    await fetch(`/api/pdf-bg?page=${page}`, { method: "DELETE" });
    toast.push(`Фон удалён`);
    checkPdfBg();
  };

  const updateBgConfig = (patch: Partial<BgSettings>) => {
    setBgConfig(c => {
      if (c.mode === "all") return { ...c, all: { ...c.all, ...patch } };
      const current = c.pages[bgPageScope as number] || { ...DEFAULT_BG };
      return {
        ...c,
        pages: { ...c.pages, [bgPageScope as number]: { ...current, ...patch } },
      };
    });
  };

  const selected = notes.find((n) => n.id === selectedId) || null;
  const subjectName = (id: number) => subjects.find((s) => s.id === id)?.name || "";

  const filtered = useMemo(() => {
    let result = notes;
    if (subjectFilter !== "all") result = result.filter((n) => n.subjectId === subjectFilter);
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(n => n.title.toLowerCase().includes(query) || subjectName(n.subjectId).toLowerCase().includes(query));
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, subjects, subjectFilter, search]);

  const handleContentReady = useCallback(() => {
    if (!contentRef.current) return;
    const root = contentRef.current;
    
    // Считаем таблицы для интерфейса настроек
    const found = Array.from(root.querySelectorAll<HTMLTableElement>("table"));
    setTableCount(found.length);
    const labels = found.map((table, i) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map(c => c.textContent?.trim()).filter(Boolean).slice(0, 2).join(" · ");
      return headers || `Таблица ${i + 1}`;
    });
    setTableLabels(labels);
    setTables((c) => {
      const next = { ...c };
      found.forEach((_, i) => { if (!next[i]) next[i] = { ...DEFAULT_TABLE }; });
      return next;
    });

    // Измеряем высоту для виртуальной пагинации (чтобы знать сколько фонов рисовать)
    const measure = () => {
        if (!contentRef.current) return;
        // 1mm = ~3.78px на экранах
        const rootH = contentRef.current.getBoundingClientRect().height;
        const pageHMm = getPageHeightMm(format, orientation);
        const mmPx = 3.78; // Approximate conversion
        const pages = Math.max(1, Math.ceil(rootH / (pageHMm * mmPx)));
        if (pages !== totalPages) setTotalPages(pages);
    };
    measure();
    setTimeout(measure, 500); // Повторный замер после рендеринга формул
  }, [format, orientation, totalPages]);

  // Генерируем CSS для таблиц, чтобы React не трогал DOM
  const tableStyles = useMemo(() => {
    let css = "";
    Object.keys(tables).forEach((key) => {
      const i = Number(key);
      const conf = tables[i];
      css += `.pdf-root-table tbody table:nth-of-type(${i + 1}) { width: ${conf.width}% !important; max-width: ${conf.width}% !important; font-size: ${conf.fontSize}pt !important; margin: 0 auto !important; table-layout: fixed !important; }\n`;
    });
    return css;
  }, [tables]);


  async function printPdf() {
    if (!selected) return;
    setPrinting(true);
    const prev = document.title;
    try {
      document.documentElement.dataset.pdfFormat = format;
      document.documentElement.dataset.pdfOrientation = orientation;
      document.title = `${selected.title} — KAGURA•KONSPEKT`;
      await new Promise(r => setTimeout(r, 500));
      window.print();
    } finally {
      document.title = prev;
      setPrinting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-32"><Spinner size={34} /></div>;
  if (notes.length === 0) return <EmptyState icon={<FileText size={36} />} title="Конспектов пока нет" />;

  const pageClass = orientation === "landscape" ? "pdf-landscape" : "pdf-portrait";

  return (
    <div className="pdf-workspace">
      <header className="page-hero pdf-controls anim-in w-full max-w-7xl mx-auto px-4">
        <h1 className="page-title">MD2PDF</h1>
        <p className="page-sub">Настройка печатного документа</p>
      </header>

      <div className="pdf-toolbar pdf-controls panel p-4 mb-5 anim-in anim-in-1 w-full max-w-7xl mx-auto">
        <div className="pdf-toolbar-row">
          <div className="pdf-toolbar-group">
            <label className="pdf-toolbar-label"><FolderOpen size={13} /> Предмет</label>
            <select className="select !py-1.5" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">Все предметы</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({notes.filter(n => n.subjectId === s.id).length})</option>)}
            </select>
          </div>

          <div className="pdf-toolbar-group pdf-toolbar-grow">
            <label className="pdf-toolbar-label"><FileText size={13} /> Конспект</label>
            <div className="row gap-2">
              <div className="row gap-1 panel-flat px-2 py-0.5 flex-1">
                <Search size={13} className="muted" />
                <input className="input !border-0 !bg-transparent !px-1 !py-1" placeholder="Поиск…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="select !py-1.5 max-w-60" value={selectedId ?? ""} onChange={e => { setSelectedId(Number(e.target.value)); setTables({}); setTotalPages(1); }}>
                {filtered.map(n => <option key={n.id} value={n.id}>{subjectName(n.subjectId) ? `${subjectName(n.subjectId)} · ` : ""}{n.title}</option>)}
              </select>
            </div>
          </div>

          <div className="pdf-toolbar-group">
            <label className="pdf-toolbar-label">Страница</label>
            <div className="row gap-2">
              <select className="select !py-1.5" value={format} onChange={e => {setFormat(e.target.value as any); setTotalPages(1);}}>
                <option value="A4">A4</option><option value="A3">A3</option>
              </select>
              <select className="select !py-1.5" value={orientation} onChange={e => {setOrientation(e.target.value as any); setTotalPages(1);}}>
                <option value="portrait">Книжная</option><option value="landscape">Альбомная</option>
              </select>
            </div>
          </div>

          <div className="pdf-toolbar-group" style={{ minWidth: 260 }}>
            <label className="pdf-toolbar-label"><span className="flex-1">Фон и Эффекты</span>
              <label className="row gap-1 cursor-pointer text-[10px] normal-case"><input type="checkbox" className="checkbox !w-3 !h-3" checked={showGlow} onChange={e => setShowGlow(e.target.checked)} /> Glow</label>
            </label>
            <div className="row gap-2 mb-1">
              <select className="select !py-1 !text-xs !min-h-0" value={bgConfig.mode} onChange={e => { const mode = e.target.value as any; setBgConfig({ ...bgConfig, mode }); if (mode === "per_page" && bgPageScope === "all") setBgPageScope(1); }}>
                <option value="all">Для всех страниц</option><option value="per_page">Для каждой страницы</option>
              </select>
              {bgConfig.mode === "per_page" && (
                <select className="select !py-1 !text-xs !min-h-0" value={bgPageScope} onChange={e => setBgPageScope(Number(e.target.value))}>
                  {Array.from({ length: totalPages }).map((_, i) => <option key={i+1} value={i+1}>Стр. {i + 1} {availableBgs.includes(String(i+1)) ? "🖼️" : ""}</option>)}
                </select>
              )}
            </div>
            <div className="row gap-2">
              <button className="btn btn-ghost !py-1 !px-2 text-xs" onClick={() => bgInputRef.current?.click()}>{availableBgs.includes(bgConfig.mode === "all" ? "all" : String(bgPageScope)) ? "Заменить" : "Фон"}</button>
              {availableBgs.includes(bgConfig.mode === "all" ? "all" : String(bgPageScope)) && <button className="btn btn-ghost !p-1 text-red-400" onClick={removeBg}><X size={13} /></button>}
              <input ref={bgInputRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && handleBgUpload(e.target.files[0])} />
              {(() => {
                const hasImg = availableBgs.includes(bgConfig.mode === "all" ? "all" : String(bgPageScope));
                if (!hasImg) return null;
                const active = bgConfig.mode === "all" ? bgConfig.all : (bgConfig.pages[bgPageScope as number] || DEFAULT_BG);
                const isCover = active.fit === "cover";
                return (
                  <div className="row gap-2 flex-1">
                    <button className={`btn btn-icon !p-1 ${isCover ? "btn-accent" : "btn-ghost"}`} onClick={() => updateBgConfig({ fit: "cover" })} title="Заполнить (обрезка краев)"><Maximize size={14} /></button>
                    <button className={`btn btn-icon !p-1 ${!isCover ? "btn-accent" : "btn-ghost"}`} onClick={() => updateBgConfig({ fit: "contain" })} title="Вместить (без обрезки)"><Minimize size={14} /></button>
                    <input type="range" min={0} max={100} className="seek !h-1 !w-16" title="Позиция X" value={active.x} onChange={e => updateBgConfig({ x: Number(e.target.value) })} />
                    <input type="range" min={0} max={100} className="seek !h-1 !w-16" title="Позиция Y" value={active.y} onChange={e => updateBgConfig({ y: Number(e.target.value) })} />
                    <input type="range" min={0.05} max={1} step={0.05} className="seek !h-1 !w-12" title="Прозрачность" value={active.opacity} onChange={e => updateBgConfig({ opacity: Number(e.target.value) })} />
                  </div>
                );
              })()}
            </div>
          </div>

          <button className="btn btn-accent" onClick={printPdf} disabled={printing || !selected}>
            {printing ? <Spinner /> : <Printer size={15} />} {printing ? "Печать…" : "Печать / PDF"}
          </button>
        </div>

        {tableCount > 0 && (
          <div className="mt-3">
            <button className="btn btn-ghost text-xs w-full !justify-start" onClick={() => setShowTables(!showTables)}>
              <SlidersHorizontal size={13} /> Таблицы ({tableCount}) <ChevronDown size={13} style={{ transform: showTables ? "rotate(180deg)" : "none" }} />
            </button>
            {showTables && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mt-2">
                {Array.from({ length: tableCount }, (_, i) => {
                  const config = tables[i] || DEFAULT_TABLE;
                  return (
                    <div key={i} className="pdf-table-control text-xs">
                      <div className="font-bold truncate mb-1">{i + 1}. {tableLabels[i]}</div>
                      <div className="row gap-2"><span>W</span><input type="range" min={40} max={100} step={5} className="seek" value={config.width} onChange={e => { const val = Number(e.target.value); setTables(curr => ({...curr, [i]: {...(curr[i] || DEFAULT_TABLE), width: val}})) }} /><b>{config.width}%</b></div>
                      <div className="row gap-2"><span>S</span><input type="range" min={7} max={16} step={0.5} className="seek" value={config.fontSize} onChange={e => { const val = Number(e.target.value); setTables(curr => ({...curr, [i]: {...(curr[i] || DEFAULT_TABLE), fontSize: val}})) }} /><b>{config.fontSize}pt</b></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <main className="pdf-preview-area anim-in anim-in-2">
        <style dangerouslySetInnerHTML={{ __html: tableStyles }} />
        {selected && (
          <div className={`pdf-sheet ${pageClass}`} data-format={format}>
            <div className="pdf-base-bg" />
            
            <div className="pdf-backgrounds">
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                let bgUrl: string | null = null;
                let activeConf: BgSettings | null = null;
                
                if (bgConfig.mode === "all" && availableBgs.includes("all")) {
                  bgUrl = `/api/pdf-bg?page=all&t=${Date.now()}`;
                  activeConf = bgConfig.all;
                } else if (bgConfig.mode === "per_page" && availableBgs.includes(String(pageNum))) {
                  bgUrl = `/api/pdf-bg?page=${pageNum}&t=${Date.now()}`;
                  activeConf = bgConfig.pages[pageNum] || DEFAULT_BG;
                }

                return (
                  <div key={i} className={`pdf-page-slice ${showGlow ? "pdf-glow" : ""}`} style={{ top: `calc(${i} * var(--page-h))` }}>
                    {bgUrl && activeConf && (
                      <div className="pdf-user-bg-layer" style={{ opacity: activeConf.opacity }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bgUrl} alt="" style={{ objectFit: activeConf.fit, objectPosition: `${activeConf.x}% ${activeConf.y}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <table className="pdf-root-table">
              <thead>
                <tr>
                  <th className="pdf-header-cell">
                    <div className="pdf-brand">
                      <BookOpenText size={18} /> KAGURA<b>•</b>KONSPEKT
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody ref={contentRef}>
                <tr>
                  <td className="pdf-content-cell">
                    <div className="pdf-document">
                      <div className="pdf-note-head">
                        {subjectName(selected.subjectId) && <span className="pdf-subject">{subjectName(selected.subjectId)}</span>}
                        <h1>{selected.title}</h1>
                        <time>Обновлено {new Date(selected.updatedAt).toLocaleDateString("ru-RU")}</time>
                      </div>
                      {/* Мемоизированный компонент, не перерендерится при изменении слайдеров */}
                      <StaticMarkdown source={selected.content} onReady={handleContentReady} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

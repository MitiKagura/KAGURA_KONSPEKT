"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Code2,
  FileCode2,
  GitBranch,
  GitFork,
  Grid2x2,
  ListTree,
  Info,
  Lightbulb,
  OctagonAlert,
  Workflow,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Radical,
  Sigma,
  Strikethrough,
  Superscript,
  Table,
  TriangleAlert,
} from "lucide-react";
import { renderMarkdownToHtml } from "@/lib/markdown-render";

interface MathJaxApi {
  startup?: { promise?: Promise<void> };
  typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
  typesetClear?: (elements?: HTMLElement[]) => void;
  texReset?: () => void;
}

declare global {
  interface Window {
    MathJax?: MathJaxApi | Record<string, unknown>;
  }
}

/**
 * Пакеты TeX, включённые всегда.
 *
 * ВАЖНО: `physics` сюда намеренно НЕ входит. Он переопределяет \div как
 * оператор дивергенции (∇·), из-за чего обычное деление $a \div b$
 * отрисовывалось перевёрнутым треугольником. Пакет остаётся доступным
 * по требованию: \require{physics} в самой формуле.
 */
const TEX_PACKAGES = [
  "amscd",
  "bbox",
  "boldsymbol",
  "braket",
  "bussproofs",
  "cancel",
  "cases",
  "centernot",
  "color",
  "colortbl",
  "dsfont",
  "empheq",
  "extpfeil",
  "gensymb",
  "mathtools",
  "mhchem",
  "tagformat",
  "textcomp",
  "unicode",
  "units",
  "upgreek",
  "verb",
];

let mathJaxReady: Promise<MathJaxApi> | null = null;
let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

/** Подключает Mermaid один раз и настраивает под текущую тему. */
function ensureMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = import("mermaid").then((module) => {
    const mermaid = module.default;
    const styles = getComputedStyle(document.documentElement);
    const value = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    mermaid.initialize({
      startOnLoad: false,
      // Диаграмма должна читаться на тёмном фоне приложения
      theme: "dark",
      securityLevel: "strict",
      fontFamily: value("--font", "system-ui, sans-serif"),
      themeVariables: {
        background: "transparent",
        primaryColor: value("--surface2", "#2a2c36"),
        primaryTextColor: value("--text", "#e6e6ef"),
        primaryBorderColor: value("--accent", "#7dd3fc"),
        lineColor: value("--accent", "#7dd3fc"),
        secondaryColor: value("--surface", "#1e2027"),
        tertiaryColor: value("--bg-soft", "#10131f"),
        fontSize: "15px",
      },
    });
    return mermaid;
  });
  return mermaidReady;
}

let mermaidSequence = 0;

/**
 * Единый рендерер Mermaid для просмотра конспекта и системного PDF.
 * Ошибка синтаксиса НЕ вставляется в документ — остаётся исходник диаграммы.
 * data-rendered="error" останавливает повторные попытки MutationObserver.
 */
export async function renderMermaidBlocks(root: ParentNode): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(".md-mermaid:not([data-rendered])"),
  );
  if (blocks.length === 0) return;

  let mermaid: Awaited<ReturnType<typeof ensureMermaid>>;
  try {
    mermaid = await ensureMermaid();
  } catch {
    return;
  }

  for (const block of blocks) {
    if (!block.isConnected || block.dataset.rendered) continue;
    const source = (block.dataset.source ?? block.textContent ?? "").trim();
    if (!source) continue;
    block.dataset.source = source;
    try {
      const { svg } = await mermaid.render(
        `kk-mermaid-${Date.now()}-${mermaidSequence++}`,
        source,
      );
      if (!block.isConnected) continue;
      block.innerHTML = svg;
      block.dataset.rendered = "true";
    } catch {
      // Не выводим «Syntax error in text / Mermaid version ...».
      // Исходник остаётся на месте, но повторный бесконечный рендер запрещён.
      block.textContent = source;
      block.dataset.rendered = "error";
    }
  }
}

/** Загружает MathJax 4 один раз на всё приложение — строго с локального сервера. */
function ensureMathJax(): Promise<MathJaxApi> {
  if (mathJaxReady) return mathJaxReady;
  mathJaxReady = new Promise<MathJaxApi>((resolve, reject) => {
    const existing = window.MathJax as MathJaxApi | undefined;
    if (existing?.typesetPromise) {
      resolve(existing);
      return;
    }

    window.MathJax = {
      loader: {
        paths: {
          mathjax: "/mathjax",
          "mathjax-newcm": "/mathjax-newcm",
        },
        load: TEX_PACKAGES.map((name) => `[tex]/${name}`),
      },
      tex: {
        packages: { "[+]": TEX_PACKAGES },
        inlineMath: [["\\(", "\\)"]],
        displayMath: [["\\[", "\\]"]],
        processEscapes: true,
        processEnvironments: true,
        processRefs: true,
        tags: "ams",
        tagSide: "right",
        useLabelIds: true,
        maxMacros: 10000,
        maxBuffer: 100 * 1024,
        macros: {
          RR: "{\\mathbb{R}}",
          NN: "{\\mathbb{N}}",
          ZZ: "{\\mathbb{Z}}",
          QQ: "{\\mathbb{Q}}",
          CC: "{\\mathbb{C}}",
        },
      },
      chtml: {
        matchFontHeight: false,
        displayAlign: "center",
      },
      options: {
        enableMenu: true,
        enableEnrichment: true,
      },
      startup: { typeset: false },
    } as Record<string, unknown>;

    const script = document.createElement("script");
    script.id = "kk-mathjax";
    script.src = "/mathjax/tex-mml-chtml.js";
    script.async = true;
    script.onload = async () => {
      try {
        const api = window.MathJax as MathJaxApi;
        await api.startup?.promise;
        resolve(api);
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error("Не удалось загрузить локальный MathJax"));
    document.head.appendChild(script);
  }).catch((error) => {
    // Разрешаем повторную попытку после временной сетевой ошибки.
    mathJaxReady = null;
    throw error;
  });
  return mathJaxReady;
}

export function renderMarkdown(src: string): string {
  return renderMarkdownToHtml(src);
}

/**
 * Пауза перед пересборкой превью, чтобы каждый символ не перезапускал MathJax.
 * Первое значение применяется мгновенно — открытие конспекта не ждёт таймер.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      // useState уже инициализирован value — повторный setState не нужен.
      return;
    }
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Небольшой кэш разбора: переключение режимов не парсит текст заново. */
const htmlCache = new Map<string, string>();
function renderCached(src: string): string {
  const hit = htmlCache.get(src);
  if (hit !== undefined) return hit;
  const html = renderMarkdownToHtml(src);
  if (htmlCache.size > 24) {
    htmlCache.delete(htmlCache.keys().next().value as string);
  }
  htmlCache.set(src, html);
  return html;
}

export function MarkdownView({
  source,
  className = "",
  debounceMs = 120,
}: {
  source: string;
  className?: string;
  debounceMs?: number;
}) {
  const debouncedSource = useDebounced(source, debounceMs);
  const html = useMemo(() => renderCached(debouncedSource), [debouncedSource]);

  // Скрипт MathJax (~1 МБ) подтягиваем заранее в фоне, как только появилось
  // превью. К моменту первой формулы библиотека уже готова.
  useEffect(() => {
    const idle =
      window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const handle = idle(() => void ensureMathJax().catch(() => undefined));
    return () => {
      if (window.cancelIdleCallback && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      }
    };
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const renderId = useRef(0);
  const typesetting = useRef(false);
  const diagramsBusy = useRef(false);
  const diagramsPending = useRef(false);
  const [mathFailed, setMathFailed] = useState(false);

  /**
   * Прогоняет MathJax по текущему содержимому превью.
   * Вызывается и при смене текста, и при пересоздании DOM (переключение
   * режимов «сплит ↔ просмотр»), где React заново вставляет исходный LaTeX.
   */
  const typeset = useCallback(async () => {
    const root = rootRef.current;
    if (!root || !root.isConnected || typesetting.current) return;

    const rawPattern = /\\(?:\(|\[|begin\{)/;
    const hasRaw = rawPattern.test(root.textContent || "");
    if (!hasRaw) {
      root.classList.remove("mathjax-pending");
      return;
    }

    const id = ++renderId.current;
    typesetting.current = true;
    // Приглушаем только математические узлы — остальной текст не двигается,
    // поэтому смены высоты и скачков layout нет.
    root.classList.add("mathjax-pending");

    const stillRaw = () =>
      root.isConnected &&
      !root.querySelector("mjx-container") &&
      rawPattern.test(root.textContent || "");

    try {
      const mathJax = await ensureMathJax();
      if (id !== renderId.current || !root.isConnected) return;
      mathJax.texReset?.();

      // MathJax 4 может завершить startup на кадр раньше готовности
      // внутреннего MathDocument — повторяем, пока маркеры на месте.
      // Пауза только ПЕРЕД повтором, поэтому обычный путь не теряет время.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (id !== renderId.current || !root.isConnected) return;
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 50));
          if (id !== renderId.current || !root.isConnected) return;
        }
        await mathJax.typesetPromise?.([root]);
        if (!stillRaw()) break;
      }
      if (id !== renderId.current) return;
      setMathFailed(stillRaw());
    } catch {
      if (id === renderId.current) setMathFailed(true);
    } finally {
      typesetting.current = false;
      root.classList.remove("mathjax-pending");
    }
  }, []);

  // Новый текст конспекта
  useEffect(() => {
    void typeset();
  }, [html, typeset]);

  /**
   * Диаграммы Mermaid. Каждая отрисовывается отдельно: ошибка в одной
   * не должна ломать остальные и весь предпросмотр.
   */
  const renderDiagrams = useCallback(async () => {
    const root = rootRef.current;
    if (!root || !root.isConnected) return;
    if (diagramsBusy.current) {
      // Выбран другой конспект, пока предыдущая диаграмма ещё строится.
      // Не теряем событие — перезапустим после завершения текущей задачи.
      diagramsPending.current = true;
      return;
    }
    if (!root.querySelector(".md-mermaid:not([data-rendered])")) return;

    diagramsBusy.current = true;
    try {
      await renderMermaidBlocks(root);
    } finally {
      diagramsBusy.current = false;
      if (diagramsPending.current) {
        diagramsPending.current = false;
        // Следующий кадр гарантирует, что React уже вставил DOM нового конспекта.
        requestAnimationFrame(() => void renderDiagrams());
      }
    }
  }, []);

  useEffect(() => {
    void renderDiagrams();
  }, [html, renderDiagrams]);

  // Страховка: React мог заменить содержимое превью в обход эффекта
  // (переключение режимов). Наблюдатель ловит это и повторяет отрисовку.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (typesetting.current) return;
      if (!root.querySelector("mjx-container") && /\\(?:\(|\[|begin\{)/.test(root.textContent || "")) {
        void typeset();
      }
      // Переключение режимов пересоздаёт разметку — диаграммы строим заново
      if (root.querySelector(".md-mermaid:not([data-rendered])")) {
        void renderDiagrams();
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [typeset, renderDiagrams]);

  /**
   * Callback-ref срабатывает ровно в момент, когда готовый HTML вставлен в DOM.
   * Это закрывает случай системного PDF: первая вставка происходила раньше,
   * чем MutationObserver успевал подписаться, и Mermaid оставалась исходником.
   */
  const attachRoot = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      requestAnimationFrame(() => {
        void typeset();
        void renderDiagrams();
      });
    },
    [typeset, renderDiagrams],
  );

  return (
    <div className="md-view-wrap">
      {mathFailed && (
        <span className="mathjax-failed">
          MathJax недоступен — формулы показаны исходным LaTeX
        </span>
      )}
      <div
        ref={attachRoot}
        className={`md-body ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

interface EditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/**
 * Маркер позиции курсора в шаблонах. Обычная «|» не подходит:
 * она встречается в таблицах Markdown и вырезалась из вставки.
 */
const CARET = "\u0000";

interface Tool {
  icon: React.ReactNode;
  title: string;
  before: string;
  after: string;
  /** Применить к началу строки (заголовки, списки, цитаты) */
  block?: boolean;
  /** Готовый блок текста; курсор встаёт на место CARET */
  snippet?: string;
  placeholder?: string;
}

const TEXT_TOOLS: Tool[] = [
  { icon: <Bold size={15} />, title: "Жирный (Ctrl+B)", before: "**", after: "**" },
  { icon: <Italic size={15} />, title: "Курсив (Ctrl+I)", before: "*", after: "*" },
  { icon: <Strikethrough size={15} />, title: "Зачёркнутый ~~текст~~ (GFM)", before: "~~", after: "~~" },
  { icon: <Heading2 size={15} />, title: "Заголовок", before: "## ", after: "", block: true },
  { icon: <Quote size={15} />, title: "Цитата", before: "> ", after: "", block: true },
  { icon: <Code2 size={15} />, title: "Код", before: "`", after: "`" },
];

const LIST_TOOLS: Tool[] = [
  { icon: <List size={15} />, title: "Маркированный список", before: "- ", after: "", block: true },
  { icon: <ListOrdered size={15} />, title: "Нумерованный список", before: "1. ", after: "", block: true },
  {
    icon: <ListTodo size={15} />,
    title: "Список задач (GFM)",
    before: "- [ ] ",
    after: "",
    block: true,
  },
  {
    icon: <Table size={15} />,
    title: "Таблица (GFM)",
    before: "",
    after: "",
    // Вертикальные черты — настоящие разделители таблицы,
    // курсор ставится в первую ячейку данных
    snippet:
      `\n| Столбец | Значение |\n| --- | --- |\n| ${CARET} |  |\n|  |  |\n`,
  },
  { icon: <Minus size={15} />, title: "Разделитель", before: "", after: "", snippet: `\n\n---\n\n` },
  { icon: <LinkIcon size={15} />, title: "Ссылка", before: "[", after: "](https://)" },
  { icon: <ImageIcon size={15} />, title: "Изображение", before: "![", after: "](https://)" },
];

/** Блок-подсказки GitHub и диаграммы. */
const BLOCK_TOOLS: Tool[] = [
  {
    icon: <ListTree size={15} />,
    title: "Дерево: нумерованный тезис с дочерними пунктами",
    before: "",
    after: "",
    snippet:
      `\n1. ${CARET}Главный тезис\n1. - Дочерний пункт\n1. - Ещё один пункт\n`,
  },
  {
    icon: <GitFork size={15} />,
    title: "Дерево: маркированный тезис с нумерованными ветвями",
    before: "",
    after: "",
    snippet:
      `\n- ${CARET}Главный тезис\n- 1. Первая ветвь\n- 2. Вторая ветвь\n`,
  },
  {
    icon: <Info size={15} />,
    title: "Заметка (GitHub Callout)",
    before: "",
    after: "",
    snippet: `\n> [!NOTE]\n> ${CARET}\n`,
  },
  {
    icon: <Lightbulb size={15} />,
    title: "Совет (GitHub Callout)",
    before: "",
    after: "",
    snippet: `\n> [!TIP]\n> ${CARET}\n`,
  },
  {
    icon: <TriangleAlert size={15} />,
    title: "Предупреждение (GitHub Callout)",
    before: "",
    after: "",
    snippet: `\n> [!WARNING]\n> ${CARET}\n`,
  },
  {
    icon: <OctagonAlert size={15} />,
    title: "Осторожно (GitHub Callout)",
    before: "",
    after: "",
    snippet: `\n> [!CAUTION]\n> ${CARET}\n`,
  },
  {
    icon: <FileCode2 size={15} />,
    title: "Блок кода с подсветкой языка",
    before: "",
    after: "",
    snippet: `\n\u0060\u0060\u0060ts\n${CARET}\n\u0060\u0060\u0060\n`,
  },
  {
    icon: <Workflow size={15} />,
    title: "Диаграмма Mermaid: блок-схема",
    before: "",
    after: "",
    snippet:
      `\n\u0060\u0060\u0060mermaid\nflowchart TD\n  A[${CARET}Начало] --> B{Условие?}\n  B -- да --> C[Действие]\n  B -- нет --> D[Конец]\n\u0060\u0060\u0060\n`,
  },
  {
    icon: <GitBranch size={15} />,
    title: "Диаграмма Mermaid: последовательность",
    before: "",
    after: "",
    snippet:
      `\n\u0060\u0060\u0060mermaid\nsequenceDiagram\n  participant ${CARET}A as Студент\n  participant B as Преподаватель\n  A->>B: Вопрос\n  B-->>A: Ответ\n\u0060\u0060\u0060\n`,
  },
];

/** Подпись-глиф для кнопки: одинаковый стиль и надёжный шрифт символов. */
function Glyph({ children, size = 14 }: { children: React.ReactNode; size?: number }) {
  return (
    <span className="md-glyph" style={{ fontSize: size }}>
      {children}
    </span>
  );
}

/** Математика: полный LaTeX через MathJax — $…$ и $$…$$ */
const MATH_TOOLS: Tool[] = [
  {
    // Иконка отражает именно строчную формулу, а не сумму
    icon: <Glyph size={13}>$x$</Glyph>,
    title: "Формула в строке: $x^2$",
    before: "$",
    after: "$",
    placeholder: "x^2",
  },
  {
    icon: <Glyph size={13}>$$</Glyph>,
    title: "Блочная формула: $$…$$",
    before: "",
    after: "",
    snippet: `\n$$\n${CARET}\n$$\n`,
  },
  {
    // Явно «числитель над знаменателем», а не косая черта
    icon: (
      <span className="md-glyph md-glyph-frac">
        <b>a</b>
        <i />
        <b>b</b>
      </span>
    ),
    title: "Дробь \\frac{a}{b}",
    before: "",
    after: "",
    snippet: `$\\frac{${CARET}}{b}$`,
  },
  {
    icon: <Radical size={15} />,
    title: "Корень \\sqrt{x}",
    before: "",
    after: "",
    snippet: `$\\sqrt{${CARET}}$`,
  },
  {
    icon: <Superscript size={15} />,
    title: "Степень и индекс: x^{}_{}",
    before: "",
    after: "",
    snippet: `$x^{${CARET}}_{}$`,
  },
  {
    icon: <Sigma size={15} />,
    title: "Сумма \\sum_{i=1}^{n}",
    before: "",
    after: "",
    snippet: `$$\n\\sum_{i=1}^{n} ${CARET}\n$$`,
  },
  {
    icon: <Glyph size={15}>∫</Glyph>,
    title: "Интеграл \\int_{a}^{b}",
    before: "",
    after: "",
    snippet: `$$\n\\int_{a}^{b} ${CARET}\\, dx\n$$`,
  },
  {
    icon: <Glyph size={12}>lim</Glyph>,
    title: "Предел \\lim_{x \\to}",
    before: "",
    after: "",
    snippet: `$$\n\\lim_{x \\to ${CARET}} f(x)\n$$`,
  },
  {
    // Раньше одна кнопка «Матрица / система» вставляла только cases
    icon: <Glyph size={15}>{"{"}</Glyph>,
    title: "Система уравнений (cases)",
    before: "",
    after: "",
    snippet: `$$\n\\begin{cases}\n${CARET} \\\\\n\\end{cases}\n$$`,
  },
  {
    icon: <Grid2x2 size={15} />,
    title: "Матрица (pmatrix)",
    before: "",
    after: "",
    snippet: `$$\n\\begin{pmatrix}\n${CARET} & b \\\\\nc & d\n\\end{pmatrix}\n$$`,
  },
  {
    icon: <Glyph size={13}>≔</Glyph>,
    title: "Выравненный вывод (align)",
    before: "",
    after: "",
    snippet: `$$\n\\begin{align}\n${CARET} &= b \\\\\n  &= c\n\\end{align}\n$$`,
  },
];

const GREEK = [
  ["\\alpha", "α"], ["\\beta", "β"], ["\\gamma", "γ"], ["\\delta", "δ"],
  ["\\varepsilon", "ε"], ["\\theta", "θ"], ["\\lambda", "λ"], ["\\mu", "μ"],
  ["\\pi", "π"], ["\\sigma", "σ"], ["\\varphi", "φ"], ["\\omega", "ω"],
  ["\\Delta", "Δ"], ["\\Sigma", "Σ"], ["\\Omega", "Ω"],
];

const SYMBOLS = [
  ["\\cdot", "·"], ["\\times", "×"], ["\\div", "÷"], ["\\pm", "±"],
  ["\\neq", "≠"], ["\\leq", "≤"], ["\\geq", "≥"], ["\\approx", "≈"],
  ["\\to", "→"], ["\\Rightarrow", "⇒"], ["\\infty", "∞"], ["\\partial", "∂"],
  ["\\in", "∈"], ["\\subset", "⊂"], ["\\cup", "∪"], ["\\cap", "∩"],
  // \sum — это оператор ∑ (U+2211), а не греческая Σ из списка выше
  ["\\forall", "∀"], ["\\exists", "∃"], ["\\sum", "∑"], ["\\prod", "∏"],
  ["\\int", "∫"], ["\\sqrt{}", "√"], ["\\angle", "∠"], ["\\perp", "⊥"],
];

export function MarkdownEditor({ value, onChange, placeholder, minHeight = 380 }: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [symbolsOpen, setSymbolsOpen] = useState(false);

  /**
   * Автоудлинение: высота поля всегда равна высоте текста, поэтому внутри
   * редактора нет своей полосы прокрутки — страница прокручивается целиком.
   */
  const autoGrow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, minHeight)}px`;
  }, [minHeight]);

  useEffect(() => {
    autoGrow();
  }, [value, autoGrow]);

  useEffect(() => {
    // Ширина колонки меняется (сплит, поворот телефона) — пересчитываем высоту
    const ta = taRef.current;
    if (!ta || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", autoGrow);
      return () => window.removeEventListener("resize", autoGrow);
    }
    const observer = new ResizeObserver(() => autoGrow());
    observer.observe(ta);
    return () => observer.disconnect();
  }, [autoGrow]);

  function apply(tool: Tool) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selected = value.slice(s, e);

    // Готовый шаблон: | обозначает позицию курсора
    if (tool.snippet) {
      const caret = tool.snippet.indexOf(CARET);
      const text = tool.snippet.replace(CARET, selected);
      onChange(value.slice(0, s) + text + value.slice(e));
      const pos = caret >= 0 ? s + caret + selected.length : s + text.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
      return;
    }

    if (tool.block) {
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const prefix = value.slice(lineStart, s);
      const text = prefix + tool.before + selected + tool.after;
      onChange(value.slice(0, lineStart) + text + value.slice(e));
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(lineStart + text.length, lineStart + text.length);
      });
      return;
    }

    const body = selected || tool.placeholder || "текст";
    const insert = tool.before + body + tool.after;
    onChange(value.slice(0, s) + insert + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + tool.before.length, s + tool.before.length + body.length);
    });
  }

  /** Вставка символа LaTeX; если курсор вне формулы — оборачиваем в $…$ */
  function insertSymbol(cmd: string) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s } = ta;
    const before = value.slice(0, s);
    const dollars = (before.match(/(?<!\\)\$/g) || []).length;
    const insideMath = dollars % 2 === 1;
    const text = insideMath ? `${cmd} ` : `$${cmd}$`;
    onChange(before + text + value.slice(ta.selectionEnd));
    const pos = s + text.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "и") {
        e.preventDefault();
        apply(TEXT_TOOLS[0]);
      } else if (k === "i" || k === "ш") {
        e.preventDefault();
        apply(TEXT_TOOLS[1]);
      } else if (k === "m" || k === "ь") {
        // Ctrl+M — быстрая формула
        e.preventDefault();
        apply(MATH_TOOLS[0]);
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = taRef.current!;
      const { selectionStart: s, selectionEnd: en } = ta;
      onChange(value.slice(0, s) + "  " + value.slice(en));
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    }
  }

  const renderGroup = (tools: Tool[]) =>
    tools.map((t) => (
      <button
        key={t.title}
        type="button"
        className="btn btn-icon btn-ghost md-tool"
        title={t.title}
        onClick={() => apply(t)}
      >
        {t.icon}
      </button>
    ));

  return (
    <div className="panel-flat overflow-hidden">
      <div className="md-toolbar" style={{ borderColor: "var(--line)" }}>
        <div className="md-tool-group">{renderGroup(TEXT_TOOLS)}</div>
        <span className="md-tool-sep" />
        <div className="md-tool-group">{renderGroup(LIST_TOOLS)}</div>
        <span className="md-tool-sep" />
        <div className="md-tool-group">{renderGroup(BLOCK_TOOLS)}</div>
        <span className="md-tool-sep" />
        <div className="md-tool-group">
          {renderGroup(MATH_TOOLS)}
          <button
            type="button"
            className={`btn btn-icon md-tool ${symbolsOpen ? "btn-accent" : "btn-ghost"}`}
            title="Греческие буквы и символы"
            onClick={() => setSymbolsOpen((v) => !v)}
          >
            <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>π</span>
          </button>
        </div>
        <span className="ml-auto text-xs muted self-center pr-2 hidden xl:block">
          LaTeX · GFM · Mermaid · Callouts · подсветка кода
        </span>
      </div>

      {symbolsOpen && (
        <div className="md-symbols">
          <div className="md-symbols-title">Греческие буквы</div>
          <div className="md-symbols-grid">
            {GREEK.map(([cmd, label]) => (
              <button
                key={cmd}
                type="button"
                className="md-symbol"
                title={cmd}
                onClick={() => insertSymbol(cmd)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="md-symbols-title">Операторы и отношения</div>
          <div className="md-symbols-grid">
            {SYMBOLS.map(([cmd, label]) => (
              <button
                key={cmd}
                type="button"
                className="md-symbol"
                title={cmd}
                onClick={() => insertSymbol(cmd)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        ref={taRef}
        className="md-editor-textarea w-full bg-transparent outline-none p-4 font-mono text-sm leading-relaxed"
        style={{
          minHeight,
          color: "var(--text)",
          border: "none",
          // Высотой управляет autoGrow — своей прокрутки у поля нет
          overflowY: "hidden",
          resize: "none",
          fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder || "Пишите конспект в Markdown… Формулы: $\\frac{a}{b}$"}
        spellCheck={false}
      />
    </div>
  );
}

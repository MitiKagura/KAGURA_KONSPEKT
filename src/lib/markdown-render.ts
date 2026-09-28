import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Options as SanitizeOptions } from "rehype-sanitize";
import type { Element, Nodes, Parent, Root, Text } from "hast";

/** Безопасный HTML Markdown + необходимые атрибуты GFM. */
const schema: SanitizeOptions = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] || []),
      // Санитайзер должен разрешить не только сам атрибут class,
      // но и конкретные значения наших компонентов.
      ["className", /^md-[A-Za-z0-9_-]+$/, /^hljs(?:-[A-Za-z0-9_-]+)?$/, "hljs"],
      "ariaHidden",
      "ariaLabel",
    ],
    input: ["type", "checked", "disabled"],
    ol: [
      "start",
      ["className", "contains-task-list", "md-tree", "md-tree-branch"],
    ],
    ul: [["className", "contains-task-list", "md-tree", "md-tree-branch"]],
    // Подсветка кода и Mermaid добавляют служебные классы
    code: [
      [
        "className",
        /^language-[A-Za-z0-9_+-]+$/,
        /^hljs(?:-[A-Za-z0-9_-]+)?$/,
        "hljs",
      ],
    ],
    span: [["className", /^md-[A-Za-z0-9_-]+$/, /^hljs(?:-[A-Za-z0-9_-]+)?$/]],
    div: [["className", /^md-[A-Za-z0-9_-]+$/]],
    pre: [["className", /^md-[A-Za-z0-9_-]+$/]],
    svg: ["className", "viewBox", "width", "height", "fill", "ariaHidden"],
    path: ["d", "fill", "fillRule", "clipRule"],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "input",
    "del",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "section",
    "sup",
    "svg",
    "path",
  ],
  clobberPrefix: "kk-",
};

function classes(node: Element) {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return node.children.map(textOf).join("");
  return "";
}

const OUTER_DISPLAY_ENV =
  /^\\begin\{(?:align\*?|alignat\*?|flalign\*?|gather\*?|multline\*?|equation\*?)\}/;

function displayMarker(tex: string) {
  const source = tex.trim();
  // Эти окружения сами создают display math в MathJax и не должны находиться
  // внутри \[...\], иначе получается ошибочное вложение equation structures.
  return OUTER_DISPLAY_ENV.test(source) ? source : `\\[${source}\\]`;
}

/**
 * Преобразует HAST-узлы remark-math в текстовые маркеры MathJax.
 * MathJax запускается уже после безопасной HTML-очистки — пользовательский
 * Markdown не может вставить произвольный HTML/скрипт.
 */
function rehypeMathJaxMarkers() {
  return function transform(tree: Root) {
    function walk(parent: Parent) {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child.type !== "element") continue;

        // Блочная формула от remark-math или fenced-блок ```math.
        if (child.tagName === "pre") {
          const code = child.children.find(
            (item): item is Element => item.type === "element" && item.tagName === "code",
          );
          if (code) {
            const cls = classes(code);
            if (cls.includes("math-display") || cls.includes("language-math")) {
              const replacement: Element = {
                type: "element",
                tagName: "div",
                properties: { className: ["mathjax-display-source"] },
                children: [{ type: "text", value: displayMarker(textOf(code)) }],
              };
              parent.children[i] = replacement;
              continue;
            }
          }
        }

        const cls = classes(child);
        if (cls.includes("math-inline")) {
          const replacement: Text = {
            type: "text",
            value: `\\(${textOf(child).trim()}\\)`,
          };
          parent.children[i] = replacement;
          continue;
        }
        // На случай math-display без <pre>.
        if (cls.includes("math-display")) {
          const replacement: Element = {
            type: "element",
            tagName: "div",
            properties: { className: ["mathjax-display-source"] },
            children: [{ type: "text", value: displayMarker(textOf(child)) }],
          };
          parent.children[i] = replacement;
          continue;
        }
        walk(child);
      }
    }
    walk(tree);
  };
}



/**
 * GitHub Callouts: цитата, начинающаяся с [!NOTE], [!TIP], [!IMPORTANT],
 * [!WARNING] или [!CAUTION], превращается в оформленный блок-подсказку.
 */
const CALLOUTS: Record<string, string> = {
  NOTE: "Заметка",
  TIP: "Совет",
  IMPORTANT: "Важно",
  WARNING: "Предупреждение",
  CAUTION: "Осторожно",
};

function rehypeCallouts() {
  return function transform(tree: Root) {
    function walk(parent: Parent) {
      for (const child of parent.children) {
        if (child.type !== "element") continue;
        if (child.tagName !== "blockquote") {
          walk(child);
          continue;
        }
        const first = child.children.find(
          (item): item is Element => item.type === "element" && item.tagName === "p",
        );
        if (!first) continue;
        const match = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(textOf(first));
        if (!match) {
          walk(child);
          continue;
        }
        const kind = match[1].toUpperCase();

        // Убираем сам маркер, сохраняя остальной текст цитаты
        let removed = false;
        const strip = (node: Parent) => {
          for (const item of node.children) {
            if (removed) return;
            if (item.type === "text") {
              const cleaned = item.value.replace(/^\s*\[![a-z]+\]\s*\n?/i, "");
              if (cleaned !== item.value) {
                item.value = cleaned;
                removed = true;
              }
            } else if (item.type === "element") {
              strip(item);
            }
          }
        };
        strip(first);
        if (!textOf(first).trim()) {
          child.children = child.children.filter((item) => item !== first);
        }

        child.properties = {
          ...child.properties,
          className: ["md-callout", `md-callout-${kind.toLowerCase()}`],
        };
        child.children.unshift({
          type: "element",
          tagName: "div",
          properties: { className: ["md-callout-title"] },
          children: [{ type: "text", value: CALLOUTS[kind] }],
        });
      }
    }
    walk(tree);
  };
}

/**
 * Блоки ```mermaid не подсвечиваем как код: их отрисует Mermaid уже
 * в браузере. Здесь только сохраняем исходник диаграммы.
 */
function rehypeMermaid() {
  return function transform(tree: Root) {
    function walk(parent: Parent) {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child.type !== "element") continue;
        if (child.tagName === "pre") {
          const code = child.children.find(
            (item): item is Element => item.type === "element" && item.tagName === "code",
          );
          if (code && classes(code).includes("language-mermaid")) {
            parent.children[i] = {
              type: "element",
              tagName: "div",
              properties: { className: ["md-mermaid"] },
              children: [{ type: "text", value: textOf(code) }],
            };
            continue;
          }
        }
        walk(child);
      }
    }
    walk(tree);
  };
}

/*
 * Сокращённый синтаксис дерева тезисов.
 *
 *   1. Главный тезис          →  1. Главный тезис
 *   1. - дочерний тезис       →      - дочерний тезис
 *
 *   - Главный тезис           →  - Главный тезис
 *   - 1. дочерний тезис       →      1. дочерний тезис
 *
 * Внутри fenced-кода ничего не меняем.
 */
/**
 * Сокращённый синтаксис дерева тезисов.
 *
 * ФОРМАТ 1: нумерованный родитель + маркированные дети.
 * Все строки начинаются с ОДНОГО И ТОГО ЖЕ номера, и дети обязательно
 * используют «N. - текст» (номер, точка, пробел, дефис, пробел):
 *
 *   1. Родитель
 *   1. - Дочерний
 *   1. - Ещё дочерний
 *
 * Если номера различаются (1. 2. 3.), это обычный нумерованный список.
 *
 * ФОРМАТ 2: маркированный родитель + нумерованные дети.
 * Родитель — обычный «- текст» (без цифры после дефиса),
 * а дети обязательно используют «- N. текст» (дефис, пробел, цифра, точка):
 *
 *   - Родитель
 *   - 1. Первая ветвь
 *   - 2. Вторая ветвь
 *
 * Случай «- - текст» (дефис дефис) — это обычный вложенный список,
 * а не дерево: он НЕ преобразуется.
 */
function normalizeThesisTrees(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }

    // ФОРМАТ 1: нумерованный родитель + дети «N. - текст».
    // Ключевое условие: все дочерние строки начинаются с ТОГО ЖЕ номера,
    // что и родитель. Это отличает дерево от обычного списка 1. 2. 3.
    const ordered = /^(\s*)(\d+)[.)]\s+(?![-*+]\s)(.+)$/.exec(line);
    if (ordered) {
      const indent = ordered[1];
      const parentNum = ordered[2];
      const escaped = indent.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
      // Дети должны иметь ровно тот же номер: «1. - текст» при родителе «1. ...»
      const childPattern = new RegExp(
        `^${escaped}${parentNum}[.)]\\s+[-*+]\\s+(.+)$`,
      );
      const next = lines[index + 1] || "";
      if (childPattern.test(next)) {
        output.push(line);
        while (index + 1 < lines.length) {
          const match = childPattern.exec(lines[index + 1]);
          if (!match) break;
          output.push(`${indent}    - ${match[1]}`);
          index++;
        }
        continue;
      }
    }

    // ФОРМАТ 2: маркированный родитель + дети «- N. текст».
    // Родитель: «- текст» где текст НЕ начинается с цифры и НЕ начинается с дефиса.
    // «- - текст» — это обычный вложенный маркированный список, пропускаем.
    const bullet = /^(\s*)[-*+]\s+(?![-*+]\s)(?!\d+[.)]\s)(.+)$/.exec(line);
    if (bullet) {
      const indent = bullet[1];
      const escaped = indent.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
      const childPattern = new RegExp(
        `^${escaped}[-*+]\\s+(\\d+)[.)]\\s+(.+)$`,
      );
      const next = lines[index + 1] || "";
      if (childPattern.test(next)) {
        output.push(line);
        while (index + 1 < lines.length) {
          const match = childPattern.exec(lines[index + 1]);
          if (!match) break;
          output.push(`${indent}    ${match[1]}. ${match[2]}`);
          index++;
        }
        continue;
      }
    }

    output.push(line);
  }
  return output.join("\n");
}

/** Добавляет классы только спискам с настоящими дочерними ветвями. */
function rehypeThesisTrees() {
  return function transform(tree: Root) {
    function addClass(node: Element, value: string) {
      const current = classes(node);
      if (!current.includes(value)) current.push(value);
      node.properties.className = current;
    }

    function walk(node: Element | Root) {
      if (node.type === "element" && (node.tagName === "ol" || node.tagName === "ul")) {
        const directItems = node.children.filter(
          (child): child is Element => child.type === "element" && child.tagName === "li",
        );
        const branches: Element[] = [];
        for (const item of directItems) {
          // Дерево: <li> содержит И текст, И вложенный список.
          // Если <li> содержит ТОЛЬКО вложенный список (без текста) — это
          // обычный двойной отступ Markdown («- - текст»), не дерево.
          const hasOwnText = item.children.some(
            (child) =>
              (child.type === "text" && child.value.trim().length > 0) ||
              (child.type === "element" &&
                child.tagName !== "ol" &&
                child.tagName !== "ul" &&
                child.tagName !== "br" &&
                textOf(child).trim().length > 0),
          );
          if (!hasOwnText) continue;

          for (const child of item.children) {
            if (
              child.type === "element" &&
              (child.tagName === "ol" || child.tagName === "ul")
            ) {
              branches.push(child);
            }
          }
        }
        if (branches.length > 0) {
          addClass(node, "md-tree");
          for (const branch of branches) addClass(branch, "md-tree-branch");
        }
      }
      if ("children" in node) {
        for (const child of node.children) {
          if (child.type === "element") walk(child);
        }
      }
    }
    walk(tree);
  };
}

const processor = unified()
  .use(remarkParse)
  // GitHub Flavored Markdown: таблицы, задачи, автоссылки, ~~зачёркивание~~
  .use(remarkGfm)
  // Сохраняем реальные переносы строк: `строка 1\nстрока 2` → `<br>`.
  // Это также исправляет ленивое продолжение пункта `- текст\nПривет`.
  .use(remarkBreaks)
  // $inline$, $$display$$ и fenced ```math
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeMathJaxMarkers)
  .use(rehypeThesisTrees)
  .use(rehypeCallouts)
  // Mermaid раньше подсветки: диаграммы не должны попасть в highlight
  .use(rehypeMermaid)
  .use(rehypeHighlight, { detect: true, ignoreMissing: true })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify, { allowDangerousHtml: false });

/**
 * remark-math v6 считает блочной только формулу, у которой $$ стоят на
 * отдельных строках. Пользователь часто пишет $$x^2$$ в одну строку —
 * нормализуем такой вариант. Внутри fenced-кода ничего не меняем.
 */
function normalizeBlockMath(src: string): string {
  const lines = src.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const match = /^(\s*)\$\$(.+?)\$\$\s*$/.exec(line);
      if (match && match[2].trim()) {
        return `${match[1]}$$\n${match[2].trim()}\n${match[1]}$$`;
      }
      return line;
    })
    .join("\n");
}

/** Markdown → безопасный HTML с маркерами для локального MathJax 4. */
export function renderMarkdownToHtml(src: string): string {
  try {
    return String(
      processor.processSync(
        normalizeThesisTrees(normalizeBlockMath(src || "")),
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка разбора Markdown";
    // Сообщение не содержит HTML из исходного Markdown.
    return `<p class="md-error">Не удалось разобрать Markdown: ${message.replace(/[<>&"]/g, "")}</p>`;
  }
}

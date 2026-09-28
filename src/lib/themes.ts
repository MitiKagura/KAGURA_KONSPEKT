// Общие (client-safe) определения тем KAGURA•KONSPEKT
export interface ThemeDef {
  id: string;
  name: string;
  desc: string;
  vars: Record<string, string>; // значения по умолчанию (hex), переопределяются клиентом
}

export const THEMES: ThemeDef[] = [
  {
    id: "material",
    name: "Material You 3",
    desc: "Тональные поверхности, округлые пилюли, акцентные контейнеры",
    vars: {
      bg: "#121318",
      bgSoft: "#1a1b21",
      surface: "#1e2027",
      surface2: "#2a2c36",
      text: "#e4e1ec",
      muted: "#9090a3",
      accent: "#c3c0ff",
      accent2: "#e8bad9",
      onAccent: "#2b2451",
      line: "rgba(196,192,255,0.14)",
    },
  },
  {
    id: "oneui",
    name: "One UI 9",
    desc: "Крупные заголовки, контент под большой палец, мягкие радиусы",
    vars: {
      bg: "#0b0b0f",
      bgSoft: "#121217",
      surface: "#17171d",
      surface2: "#212129",
      text: "#f3f3f7",
      muted: "#8b8b98",
      accent: "#5b9dff",
      accent2: "#7ee0c3",
      onAccent: "#04122b",
      line: "rgba(255,255,255,0.08)",
    },
  },
  {
    id: "glass",
    name: "Liquid Glass",
    desc: "Полупрозрачное стекло, глубокий блюр, парящие панели",
    vars: {
      bg: "#0a0c14",
      bgSoft: "#10131f",
      surface: "rgba(255,255,255,0.055)",
      surface2: "rgba(255,255,255,0.10)",
      text: "#eef1f8",
      muted: "#98a2b8",
      accent: "#7dd3fc",
      accent2: "#c4b5fd",
      onAccent: "#08222f",
      line: "rgba(255,255,255,0.12)",
    },
  },
  {
    id: "steam",
    name: "Steam",
    desc: "Синевато-серая сталь, компактные панели, индустриальный шик",
    vars: {
      bg: "#1b2838",
      bgSoft: "#16202d",
      surface: "#212e3f",
      surface2: "#2a3a4f",
      text: "#c7d5e0",
      muted: "#6f8296",
      accent: "#66c0f4",
      accent2: "#a4d007",
      onAccent: "#0d1b2a",
      line: "rgba(199,213,224,0.1)",
    },
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "glass";

/** Редактируемые пользователем цвета (hex) */
export const EDITABLE_VARS: { key: string; label: string }[] = [
  { key: "bg", label: "Фон" },
  { key: "surface", label: "Панели" },
  { key: "text", label: "Текст" },
  { key: "muted", label: "Приглушённый" },
  { key: "accent", label: "Акцент" },
  { key: "accent2", label: "Акцент 2" },
];

export function cssVarsToStyle(vars: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [`--${camelToKebab(k)}`, v]),
  ) as Record<string, string>;
}

function camelToKebab(s: string) {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

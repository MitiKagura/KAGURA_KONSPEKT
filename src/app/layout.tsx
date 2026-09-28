import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
// Мобильная разметка. Правила действуют только при html.view-mobile,
// поэтому на десктопе файл ничего не меняет.
import "./globals_mobile.css";
import { detectFromUserAgent } from "@/lib/view-mode";

export const metadata: Metadata = {
  title: "KAGURA•KONSPEKT",
  description: "База данных конспектов: Markdown, файлы, дневник, ИИ-анализ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0c14",
};

/**
 * Тема и режим отображения ставятся до первой отрисовки, чтобы не было
 * вспышки чужого оформления. Режим из адреса (?view=) имеет приоритет
 * над сохранённым выбором и автоопределением.
 */
const bootScript = `(function(){try{
var t=localStorage.getItem("kk.theme")||"glass";
document.documentElement.setAttribute("data-theme",t);
var c=JSON.parse(localStorage.getItem("kk.colors")||"{}")[t];
if(c){for(var k in c){document.documentElement.style.setProperty("--"+k,c[k]);}}
var p=new URLSearchParams(location.search).get("view");
var ck=document.cookie.match(/(?:^|; )kk_view=(desktop|mobile)/);
var m=(p==="mobile"||p==="desktop")?p:(ck?ck[1]:(window.innerWidth<=820?"mobile":"desktop"));
document.documentElement.setAttribute("data-view",m);
// Обязательно снимаем противоположный класс: сервер мог поставить другой,
// а параметр ?view= в адресе имеет приоритет над автоопределением.
document.documentElement.classList.toggle("view-mobile",m==="mobile");
document.documentElement.classList.toggle("view-desktop",m!=="mobile");
}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Корневой layout не получает параметры адреса, поэтому здесь только
  // предварительное значение: сохранённый выбор либо тип устройства.
  // Итоговый режим (с учётом ?view=) выставит ViewModeProvider.
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie") || "";
  const savedMatch = cookieHeader.match(/(?:^|;\s*)kk_view=(desktop|mobile)/);
  const initialMode = savedMatch
    ? (savedMatch[1] as "desktop" | "mobile")
    : detectFromUserAgent(headerList.get("user-agent") || "");

  return (
    <html
      lang="ru"
      data-theme="glass"
      data-view={initialMode}
      className={initialMode === "mobile" ? "view-mobile" : "view-desktop"}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body suppressHydrationWarning>
        <div className="bg-scene" aria-hidden="true" />
        <div className="vignette" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}

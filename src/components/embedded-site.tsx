"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  PanelRightOpen,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";

interface CheckResult {
  embeddable: boolean;
  reachable: boolean;
  reason: string | null;
  /** Сайт показывает проверку браузера (reCAPTCHA/Cloudflare). */
  challenge?: string | null;
}

/**
 * Открывает внешний сервис внутри KAGURA•KONSPEKT.
 *
 * Некоторые сайты (md2pdf.cc, kaggle.com и другие) запрещают показ в рамке
 * через X-Frame-Options или CSP — это их защита от кликджекинга, обойти её
 * из браузера нельзя. Поэтому мы заранее спрашиваем сервер, разрешено ли
 * встраивание, и в случае запрета сразу даём рабочий путь: отдельное окно
 * рядом с приложением.
 */
export default function EmbeddedSite({
  title,
  description,
  url,
  emptyHint,
}: {
  title: string;
  description: string;
  url: string;
  emptyHint: string;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [check, setCheck] = useState<CheckResult | null>(null);
  // Прокси включается автоматически, когда сайт запрещает встраивание
  const [useProxy, setUseProxy] = useState(false);
  const loadedRef = useRef(false);

  // Через прокси страница приходит уже без запрета на встраивание
  const frameSrc = useProxy ? `/api/proxy?url=${encodeURIComponent(url)}` : url;

  const collapse = useCallback(() => setExpanded(false), []);

  // Esc закрывает полноэкранный режим, оставляя нас внутри приложения.
  useEffect(() => {
    if (!expanded) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        collapse();
      }
    }
    window.addEventListener("keydown", onKey, true);
    document.documentElement.classList.add("embed-locked");
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.documentElement.classList.remove("embed-locked");
    };
  }, [expanded, collapse]);

  // Спрашиваем сервер о возможности встраивания до показа рамки.
  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadedRef.current = false;

    // Асинхронная задача, а не синхронный setState внутри тела эффекта:
    // это не создаёт каскадный дополнительный рендер React 19.
    void Promise.resolve().then(async () => {
      if (!alive) return;
      setLoading(true);
      setCheck(null);
      try {
        const response = await fetch(
          `/api/embed-check?url=${encodeURIComponent(url)}`,
        );
        const data = (await response.json()) as CheckResult;
        if (!alive) return;
        setCheck(data);
        // Проверку браузера через прокси не пройти — рамку даже не пытаемся
        // загружать, иначе получится бесконечный цикл проверки.
        setUseProxy(!data.embeddable && !data.challenge);
        if (data.challenge) setLoading(false);
      } catch {
        if (alive) {
          setCheck({ embeddable: true, reachable: true, reason: null });
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [url, reloadKey]);

  /** Открывает сервис отдельным окном рядом — приложение остаётся на месте. */
  const openCompanion = useCallback(() => {
    const width = Math.min(1180, Math.round(window.screen.availWidth * 0.62));
    const height = Math.round(window.screen.availHeight * 0.9);
    const left = window.screen.availWidth - width;
    window.open(
      url,
      `kagura-${title}`,
      `popup=yes,width=${width},height=${height},left=${left},top=0,noopener,noreferrer`,
    );
  }, [url, title]);

  if (!url) {
    return (
      <div>
        <header className="page-hero anim-in">
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{description}</p>
        </header>
        <section className="panel p-6 anim-in anim-in-1">
          <div className="row gap-3 mb-3">
            <TriangleAlert size={20} style={{ color: "var(--accent2)" }} />
            <h2 className="text-base font-bold m-0">Ссылка не задана</h2>
          </div>
          <p className="text-sm muted mb-4">{emptyHint}</p>
          <Link href="/settings" className="btn btn-accent">
            <SettingsIcon size={15} /> Открыть настройки
          </Link>
        </section>
      </div>
    );
  }

  // Ошибку показываем только если и прокси не смог получить страницу
  const proxyFailed = check !== null && !check.reachable;
  // Сайт требует пройти проверку браузера в настоящем окне
  const needsRealBrowser = Boolean(check?.challenge);

  const frame = (
    <div className={expanded ? "embed-stage-full" : "embed-stage"}>
      {loading && !proxyFailed && !needsRealBrowser && (
        <div className="embed-loading">
          <Spinner size={26} />
          <span className="text-sm muted mt-3">
            {useProxy ? "Открываем через прокси…" : "Загружаем сервис…"}
          </span>
        </div>
      )}

      {needsRealBrowser && (
        <div className="embed-loading">
          <ShieldAlert size={28} style={{ color: "var(--accent2)" }} />
          <p className="text-sm font-bold mt-3 mb-1">
            Сайт требует пройти проверку браузера
          </p>
          <p className="text-xs muted mb-1 text-center max-w-xl">
            {check?.reason}. Такая проверка привязывается к вашему браузеру и
            адресу, поэтому во встроенной рамке она зацикливается и никогда не
            завершается.
          </p>
          <p className="text-xs muted mb-4 text-center max-w-xl">
            Откройте сервис отдельным окном: там вы обычный посетитель, проверка
            пройдёт один раз, а вход и сессия сохранятся. KAGURA•KONSPEKT
            останется открытым рядом.
          </p>
          <div className="row gap-2 flex-wrap justify-center">
            <button className="btn btn-accent" onClick={openCompanion}>
              <PanelRightOpen size={15} /> Открыть окном рядом
            </button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> В новой вкладке
            </a>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.push("Ссылка скопирована");
                } catch {
                  toast.push("Не удалось скопировать ссылку", true);
                }
              }}
            >
              <Copy size={15} /> Скопировать ссылку
            </button>
          </div>
        </div>
      )}

      {proxyFailed && (
        <div className="embed-loading">
          <TriangleAlert size={28} style={{ color: "var(--accent2)" }} />
          <p className="text-sm font-bold mt-3 mb-1">Сайт недоступен</p>
          <p className="text-xs muted mb-4 text-center max-w-lg">
            {check?.reason}
          </p>
          <div className="row gap-2 flex-wrap justify-center">
            <button className="btn btn-accent" onClick={openCompanion}>
              <PanelRightOpen size={15} /> Открыть окном рядом
            </button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> В новой вкладке
            </a>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.push("Ссылка скопирована");
                } catch {
                  toast.push("Не удалось скопировать ссылку", true);
                }
              }}
            >
              <Copy size={15} /> Скопировать ссылку
            </button>
          </div>
        </div>
      )}

      {!proxyFailed && !needsRealBrowser && check !== null && (
        <iframe
          key={`${reloadKey}-${useProxy ? "proxy" : "direct"}`}
          src={frameSrc}
          title={title}
          className="embed-frame"
          sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-same-origin allow-modals"
          referrerPolicy="no-referrer"
          allow="clipboard-write; clipboard-read; microphone"
          onLoad={() => {
            loadedRef.current = true;
            setLoading(false);
          }}
        />
      )}
    </div>
  );

  const toolbar = (
    <div className="row flex-wrap gap-2">
      <button
        className="btn"
        onClick={() => setReloadKey((value) => value + 1)}
        title="Перезагрузить сервис"
      >
        <RefreshCw size={15} /> Обновить
      </button>
      {!proxyFailed && !needsRealBrowser && (
        <button
          className={`btn ${expanded ? "btn-accent" : ""}`}
          onClick={() => setExpanded((value) => !value)}
          title={
            expanded
              ? "Свернуть — вернуться к обычному виду"
              : "Развернуть на весь экран, не покидая KAGURA•KONSPEKT"
          }
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          {expanded ? "Свернуть" : "На весь экран"}
        </button>
      )}
      <button className="btn btn-ghost" onClick={openCompanion} title="Отдельным окном">
        <PanelRightOpen size={15} /> Окном рядом
      </button>
    </div>
  );

  if (expanded) {
    return (
      <div className="embed-overlay">
        <div className="embed-overlay-bar">
          <span className="text-sm font-bold truncate">{title}</span>
          <span className="text-xs muted truncate max-sm:hidden">{url}</span>
          <span className="flex-1" />
          {toolbar}
        </div>
        {frame}
      </div>
    );
  }

  return (
    <div>
      <header className="page-hero anim-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{description}</p>
        </div>
        {toolbar}
      </header>
      <section className="panel p-2 anim-in anim-in-1">{frame}</section>
      <p className="text-xs muted mt-3">
        {needsRealBrowser
          ? "Сервис защищён проверкой браузера, поэтому работает только в отдельном окне — так проверка проходит один раз и больше не повторяется."
          : useProxy
            ? "Сайт запрещает встраивание, поэтому открыт через встроенный обратный прокси — заголовок X-Frame-Options снимается, ссылки переписываются на лету."
            : "Сервис открыт внутри приложения напрямую."}{" "}
        Ссылку можно изменить в разделе «Настройки».
      </p>
    </div>
  );
}

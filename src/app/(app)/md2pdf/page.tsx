"use client";

import { useEffect, useState } from "react";
import EmbeddedSite from "@/components/embedded-site";
import SystemMd2Pdf from "@/components/system-md2pdf";
import { Spinner } from "@/components/ui";

const FALLBACK = "https://md2pdf.cc/";

type Mode = "system" | "site";

export default function Md2PdfPage() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [url, setUrl] = useState(FALLBACK);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => {
        setMode(data?.settings?.md2pdfMode === "site" ? "site" : "system");
        setUrl(data?.settings?.md2pdfUrl || FALLBACK);
      })
      .catch(() => {
        setMode("system");
        setUrl(FALLBACK);
      });
  }, []);

  if (mode === null) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size={32} />
      </div>
    );
  }

  if (mode === "system") return <SystemMd2Pdf />;

  return (
    <EmbeddedSite
      title="MD2PDF"
      description="Внешний конвертер Markdown в PDF внутри приложения"
      url={url}
      emptyHint="Укажите адрес конвертера в настройках. По умолчанию используется https://md2pdf.cc/"
    />
  );
}

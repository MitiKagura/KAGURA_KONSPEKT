"use client";

import { useEffect, useState } from "react";
import EmbeddedSite from "@/components/embedded-site";
import { Spinner } from "@/components/ui";

export default function SpeechPage() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data) => setUrl(data?.settings?.ttsUrl || ""))
      .catch(() => setUrl(""));
  }, []);

  if (url === null) {
    return (
      <div className="flex justify-center py-32">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <EmbeddedSite
      title="Озвучка"
      description="Сервис синтеза речи для конспектов"
      url={url}
      emptyHint="Адрес сервиса озвучки пока не задан. Откройте настройки и укажите ссылку — раздел сразу заработает. Текст для озвучки готовится в ИИ-анализаторе режимом «Сплошным текстом»."
    />
  );
}

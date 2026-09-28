# KAGURA•KONSPEKT

Веб-приложение «База данных конспектов»: панель управления с файловым менеджером,
Markdown-редактором(с добавлением MathJax и mermaid), ИИ-анализатором (Ollama · qwen3:8b по стандарту), дневником пар и домашних
заданий, медиаплеерами и четырьмя тёмными темами оформления.

## 🎨 Темы оформления

Приложение поддерживает несколько визуальных стилей. Пролистайте ленту вправо, чтобы увидеть все экраны каждой темы.

---

### 💧 Liquid Glass

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-main.png" alt="Главный экран" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-files.png" alt="Файлы" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-music.png" alt="Музыка" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-notes.png" alt="Заметки" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-diary.png" alt="Дневник" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-teachers.png" alt="Преподаватели" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-test.png" alt="Тесты" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-voice.png" alt="Голосовой ввод" width="260">
  <img src=".github/assets/Liquid/LiquidGlass/LiquidGlass-settings.png" alt="Настройки" width="260">
</div>

---

### 🎨 Material You

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-main.png" alt="Главный экран" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-files.png" alt="Файлы" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-music.png" alt="Музыка" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-notes.png" alt="Заметки" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-diary.png" alt="Дневник" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-teachers.png" alt="Преподаватели" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-test.png" alt="Тесты" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-voice.png" alt="Голосовой ввод" width="260">
  <img src=".github/assets/MatYou/MaterialYou/MaterialYou-settings.png" alt="Настройки" width="260">
</div>

---

### 📱 One UI 9

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-main.png" alt="Главный экран" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-files.png" alt="Файлы" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-music.png" alt="Музыка" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-notes.png" alt="Заметки" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-diary.png" alt="Дневник" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-teachers.png" alt="Преподаватели" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-test.png" alt="Тесты" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-voice.png" alt="Голосовой ввод" width="260">
  <img src=".github/assets/OneUI/OneUI9/OneUI9-settings.png" alt="Настройки" width="260">
</div>

---

### 🕹️ Steam

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src=".github/assets/Steam/Steam/Steam-main.png" alt="Главный экран" width="260">
  <img src=".github/assets/Steam/Steam/Steam-files.png" alt="Файлы" width="260">
  <img src=".github/assets/Steam/Steam/Steam-music.png" alt="Музыка" width="260">
  <img src=".github/assets/Steam/Steam/Steam-notes.png" alt="Заметки" width="260">
  <img src=".github/assets/Steam/Steam/Steam-diary.png" alt="Дневник" width="260">
  <img src=".github/assets/Steam/Steam/Steam-teachers.png" alt="Преподаватели" width="260">
  <img src=".github/assets/Steam/Steam/Steam-test.png" alt="Тесты" width="260">
  <img src=".github/assets/Steam/Steam/Steam-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src=".github/assets/Steam/Steam/Steam-voice.png" alt="Голосовой ввод" width="260">
  <img src=".github/assets/Steam/Steam/Steam-settings.png" alt="Настройки" width="260">
</div>

## Возможности

- **Главная** — обзор: пары сегодня, активные задания, недавние конспекты.
- **Файлы** — файловый менеджер (корень `/srv/KAGURA_KONSPEKT`, у администратора
  root-доступ и видны папки всех пользователей): загрузка (drag&drop), скачивание,
  поиск по имени, переименование, удаление, встроенные просмотрщики:
  - аудио — постоянный плеер (звук не прерывается при навигации), AIMP-подобная
    полная панель + миниплеер;
  - видео — собственный стилизованный плеер (перемотка, скорость, полный экран);
  - PDF — собственный ридер на pdf.js (без Google);
  - документы Word/Excel/PowerPoint/ODF — конвертация в PDF во вкладке MD2PDF;
  - изображения, Markdown и текст — встроенный просмотр.
- **Конспекты** — разделы (Математика и Русский по умолчанию, все удаляемые через
  подтверждение вводом `yes`), Markdown-редактор с живым предпросмотром, большое
  поле названия, выгрузка `.md`, ИИ-анализ в фоне (ответ сохраняется в БД и доступен
  с любого устройства, включая телефон; есть кнопка «Копировать ответ»).
- **Дневник** — календарь недели, чёт/нечет недели с переключателем, «Добавить пару»
  (каждую неделю / только чёт / только нечет), домашние задания: предмет берётся из
  пар выбранного дня, галочка зачёркивает задание.
- **Настройки** — 4 тёмные темы (Material You 3, One UI 9, Liquid Glass, Steam),
  hex-редактор палитры (только на устройстве, хранится в localStorage), свои обои
  (смесь 65% тема / 35% обои), синхронизация конспектов ↔ папка, статус Ollama,
  смена пароля, управление пользователями (админ).

## Установка

Пока есть только 2 версии установщика: для **Arch-based систем** и для **Ubuntu**. В будущем создам версию для Windows, но не скоро >W<

Скрипт поставит зависимости, развернёт проект в `/opt/KAGURA_KONSPEKT`, создаст
**полностью отдельный экземпляр PostgreSQL** — собственный кластер с файлами в
`/var/lib/kagura_db` на порту **55432** (сервис `kagura-db.service`), хранилище
`/srv/KAGURA_KONSPEKT`, systemd-сервисы и загрузит модель `qwen3:8b.
Модель можно менять в `install.sh`, `.env.example` и в `src/lib/ollama.ts`(строка 9).

Ваш основной PostgreSQL (`/var/lib/postgres/data`, порт 5432) и его systemd-сервис
не изменяются вообще. Порт приложения: **2315**.

## Вход

При установке `install.sh` запрашивает логин и пароль
первого администратора. В проекте нет заранее заданных учётных данных.

# Приятного пользования!
```
Разработано с использованием ИИ, проверено несколькими людьми.
```

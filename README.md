# KAGURA•KONSPEKT

Веб-приложение «База данных конспектов»: панель управления с файловым менеджером,
Markdown-редактором(с добавлением MathJax и mermaid), ИИ-анализатором (Ollama · qwen3:8b по стандарту), дневником пар и домашних
заданий, медиаплеерами и четырьмя тёмными темами оформления.

## 🎨 Темы оформления

Приложение поддерживает несколько визуальных стилей. Пролистайте ленту вправо, чтобы увидеть все экраны каждой темы.

---

### 💧 Liquid Glass

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src="images/Liquid/LiquidGlass-main.png" alt="Главный экран" width="260">
  <img src="images/Liquid/LiquidGlass-files.png" alt="Файлы" width="260">
  <img src="images/Liquid/LiquidGlass-music.png" alt="Музыка" width="260">
  <img src="images/Liquid/LiquidGlass-notes.png" alt="Заметки" width="260">
  <img src="images/Liquid/LiquidGlass-diary.png" alt="Дневник" width="260">
  <img src="images/Liquid/LiquidGlass-teachers.png" alt="Преподаватели" width="260">
  <img src="images/Liquid/LiquidGlass-test.png" alt="Тесты" width="260">
  <img src="images/Liquid/LiquidGlass-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src="images/Liquid/LiquidGlass-voice.png" alt="Голосовой ввод" width="260">
  <img src="images/Liquid/LiquidGlass-settings.png" alt="Настройки" width="260">
</div>

---

### 🎨 Material You

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src="images/MatYou/MaterialYou-main.png" alt="Главный экран" width="260">
  <img src="images/MatYou/MaterialYou-files.png" alt="Файлы" width="260">
  <img src="images/MatYou/MaterialYou-music.png" alt="Музыка" width="260">
  <img src="images/MatYou/MaterialYou-notes.png" alt="Заметки" width="260">
  <img src="images/MatYou/MaterialYou-diary.png" alt="Дневник" width="260">
  <img src="images/MatYou/MaterialYou-teachers.png" alt="Преподаватели" width="260">
  <img src="images/MatYou/MaterialYou-test.png" alt="Тесты" width="260">
  <img src="images/MatYou/MaterialYou-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src="images/MatYou/MaterialYou-voice.png" alt="Голосовой ввод" width="260">
  <img src="images/MatYou/MaterialYou-settings.png" alt="Настройки" width="260">
</div>

---

### 📱 One UI 9

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src="images/OneUI/OneUI9-main.png" alt="Главный экран" width="260">
  <img src="images/OneUI/OneUI9-files.png" alt="Файлы" width="260">
  <img src="images/OneUI/OneUI9-music.png" alt="Музыка" width="260">
  <img src="images/OneUI/OneUI9-notes.png" alt="Заметки" width="260">
  <img src="images/OneUI/OneUI9-diary.png" alt="Дневник" width="260">
  <img src="images/OneUI/OneUI9-teachers.png" alt="Преподаватели" width="260">
  <img src="images/OneUI/OneUI9-test.png" alt="Тесты" width="260">
  <img src="images/OneUI/OneUI9-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src="images/OneUI/OneUI9-voice.png" alt="Голосовой ввод" width="260">
  <img src="images/OneUI/OneUI9-settings.png" alt="Настройки" width="260">
</div>

---

### 🕹️ Steam

<div style="overflow-x: auto; white-space: nowrap; padding-bottom: 8px;">
  <img src="images/Steam/Steam-main.png" alt="Главный экран" width="260">
  <img src="images/Steam/Steam-files.png" alt="Файлы" width="260">
  <img src="images/Steam/Steam-music.png" alt="Музыка" width="260">
  <img src="images/Steam/Steam-notes.png" alt="Заметки" width="260">
  <img src="images/Steam/Steam-diary.png" alt="Дневник" width="260">
  <img src="images/Steam/Steam-teachers.png" alt="Преподаватели" width="260">
  <img src="images/Steam/Steam-test.png" alt="Тесты" width="260">
  <img src="images/Steam/Steam-md2pdf.png" alt="Конвертер MD → PDF" width="260">
  <img src="images/Steam/Steam-voice.png" alt="Голосовой ввод" width="260">
  <img src="images/Steam/Steam-settings.png" alt="Настройки" width="260">
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

```bash
git clone https://github.com/MitiKagura/KAGURA_KONSPEKT.git
```
Пока есть только 2 версии установщика: для **Arch-based систем** и для **Ubuntu**. В будущем создам версию для Windows, но не скоро >W<
**Для Arch:**
```bash
sudo pacman -S paru
chmod +x ARCH.sh
bash ARCH.sh
# Так надёжнее для тех, кто может использовать кастомные терминальные оболочки. Главное чтобы был paru
```
**Для Ubuntu:**
```bash
chmod +x UBUNTU.sh
bash UBUNTU.sh
```
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

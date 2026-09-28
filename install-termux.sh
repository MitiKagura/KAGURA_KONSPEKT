#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# KAGURA•KONSPEKT — автономная установка в Termux / Android
#
# Требования:
#   • Termux из F-Droid или GitHub (версия Google Play ограничена)
#   • Android arm64 рекомендуется
#   • для автозапуска после перезагрузки: приложение Termux:Boot
#
# Изоляция:
#   • приложение:  $HOME/KAGURA_KONSPEKT
#   • файлы:       $HOME/storage/shared/KAGURA_KONSPEKT
#   • PostgreSQL:  $HOME/.kagura-konspekt/postgres-55432
#   • адрес БД:    127.0.0.1:55432
#   • веб-порт:    2315
#
# Переопределения перед запуском (необязательно):
#   KAGURA_FILES_DIR=/свой/путь ./install-termux.sh
#   KAGURA_SKIP_OLLAMA=1 ./install-termux.sh
#
# sudo/root НЕ ТРЕБУЕТСЯ: установщик работает только в пространстве
# обычного пользователя Termux ($HOME и $PREFIX). Даже если в системе
# установлен tsu/sudo — скрипт их не вызывает ни разу.
# ============================================================
set -Eeuo pipefail

GREEN=$'\033[0;32m'; BLUE=$'\033[0;34m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
say()  { printf '%s[KAGURA]%s %s\n' "$BLUE" "$NC" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$YELLOW" "$NC" "$*"; }
die()  { printf '%s[FAIL]%s %s\n' "$RED" "$NC" "$*" >&2; exit 1; }

# ---------- Проверка Termux ----------
if [[ -z "${PREFIX:-}" || "$PREFIX" != *"com.termux"* ]]; then
  die "Этот установщик предназначен только для Termux на Android."
fi

# ---------- Защита от root/sudo ----------
# В Termux sudo не нужен: pkg ставит пакеты в $PREFIX текущего пользователя,
# PostgreSQL и сервисы хранят файлы в $HOME. Запуск под root не только не
# нужен, но и вреден: $HOME/$PREFIX «переедут» в /root или системные пути,
# и приложение потом не запустится от обычного пользователя.
EUID_CURRENT="${EUID:-$(id -u 2>/dev/null || echo 1)}"
if [[ "$EUID_CURRENT" -eq 0 ]]; then
  die "Скрипт запущен под root. В Termux sudo/root не требуется — завершите root-сессию и запустите просто: ./install-termux.sh"
fi

# Все целевые каталоги должны быть доступны для записи текущему пользователю.
for dir in "$HOME" "$PREFIX"; do
  if [[ ! -w "$dir" ]]; then
    die "Нет права записи в $dir. Установщик работает только в пространстве обычного termux-user — не запускайте его через su/tsu/sudo и переустановите Termux при повреждённых правах."
  fi
done
ok "Пользователь: $(id -un 2>/dev/null || echo termux) (uid=${EUID_CURRENT}) — sudo не требуется, установка в пользовательском пространстве"

APP_DIR="${KAGURA_APP_DIR:-$HOME/KAGURA_KONSPEKT}"
STATE_DIR="$HOME/.kagura-konspekt"
DB_DIR="$STATE_DIR/postgres-55432"
DB_LOG="$STATE_DIR/postgresql.log"
DB_NAME="kagura_db"
DB_USER="kagura"
DB_PORT=55432
APP_PORT=2315
MODEL="qwen3:8b"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$PREFIX/var/service"
SERVICE_LOG_DIR="$PREFIX/var/log/sv"

printf '\n'
printf '  ╔══════════════════════════════════════════════╗\n'
printf '  ║  KAGURA•KONSPEKT — Termux / Android         ║\n'
printf '  ║  Next.js · PostgreSQL · Ollama · порт 2315  ║\n'
printf '  ╚══════════════════════════════════════════════╝\n\n'

say "Платформа: $(uname -m), Android $(getprop ro.build.version.release 2>/dev/null || echo '?')"

echo
echo "Введите учётные данные первого администратора."
echo "Заранее заданных логина и пароля в проекте нет."
while true; do
  read -r -p "Логин администратора: " ADMIN_USERNAME
  if [[ -z "$ADMIN_USERNAME" || "$ADMIN_USERNAME" == *"/"* || "$ADMIN_USERNAME" == *"\\"* || "$ADMIN_USERNAME" == *$'\n'* ]]; then
    warn "Логин не должен быть пустым и не может содержать / или \\."
    continue
  fi
  break
done
while true; do
  read -r -s -p "Пароль администратора (минимум 4 символа): " ADMIN_PASSWORD
  echo
  [[ ${#ADMIN_PASSWORD} -ge 4 ]] || { warn "Пароль слишком короткий."; continue; }
  read -r -s -p "Повторите пароль: " ADMIN_PASSWORD_CONFIRM
  echo
  [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || { warn "Пароли не совпадают."; continue; }
  unset ADMIN_PASSWORD_CONFIRM
  break
done
ADMIN_USERNAME_B64="$(printf '%s' "$ADMIN_USERNAME" | base64 | tr -d '\n')"
ADMIN_PASSWORD_B64="$(printf '%s' "$ADMIN_PASSWORD" | base64 | tr -d '\n')"
unset ADMIN_PASSWORD

# ---------- 1. Пакеты ----------
# Ошибка «Sub-process …/bin/dpkg returned an error code (1)» — состояние dpkg
# испорчено ранее прерванным обновлением или битым зеркалом. Поэтому перед любой
# установкой пакетов чиним dpkg, ставим пакеты по одному с повторами, а при
# повторном отказе эскалируем в полное pkg upgrade вместо мгновенной смерти скрипта.
export DEBIAN_FRONTEND=noninteractive
DPKG_OPTS="--force-confnew"

pkg_dpkg_help() {
  printf '%s\n' "${YELLOW}----- Как разблокировать dpkg вручную -----${NC}"
  cat <<'EOF'
  1. dpkg --configure -a
  2. apt-get install -f -y
  3. apt-get clean
  4. termux-change-repo        # выберите актуальное зеркало
  5. pkg upgrade -y            # до конца, затем снова перезапустите установщик
EOF
  printf '%s\n' "${YELLOW}---------------------------------------------${NC}"
}

apt_repair() {
  say "Восстанавливаю пакетный менеджер (dpkg --configure -a / apt-get -f install)…"
  apt-get clean >/dev/null 2>&1 || true
  dpkg --configure -a >/dev/null 2>&1 || true
  apt-get install -f -y -o "Dpkg::Options::=$DPKG_OPTS" >/dev/null 2>&1 || true
}

pkg_update_repair() {
  apt_repair
  pkg update -y || { apt_repair; pkg update -y; } \
    || { pkg_dpkg_help; die "Не удалось обновить индексы пакетов — сначала выполните шаги выше."; }
}

install_one() {
  local name="$1"
  if pkg install -y -o "Dpkg::Options::=$DPKG_OPTS" "$name"; then return 0; fi
  apt_repair
  if pkg install -y -o "Dpkg::Options::=$DPKG_OPTS" "$name"; then return 0; fi
  say "«$name» упорно не ставится — делаю полное обновление пакетов (pkg upgrade)…"
  pkg upgrade -y -o "Dpkg::Options::=$DPKG_OPTS" || apt_repair
  apt_repair
  pkg install -y -o "Dpkg::Options::=$DPKG_OPTS" "$name"
}

say "Обновляю индексы пакетов Termux…"
pkg_update_repair

FREE_MB="$(df -Pm "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')"
say "Свободно на накопителе: ${FREE_MB:-?} МБ"
if [[ "${FREE_MB:-0}" -gt 0 && "${FREE_MB:-0}" -lt 1300 ]]; then
  die "Мало свободного места (${FREE_MB} МБ). Приложению и базе нужно ≥1.3 ГБ (с моделью ИИ — ещё +5 ГБ). Освободите место и перезапустите."
elif [[ "${FREE_MB:-0}" -gt 0 && "${FREE_MB:-0}" -lt 6500 && "${KAGURA_SKIP_OLLAMA:-0}" != "1" ]]; then
  warn "Свободно ${FREE_MB} МБ — для модели ${MODEL} может не хватить (нужно ~5 ГБ). При чистой ошибке загрузки модели приложение всё равно установится."
fi

say "Устанавливаю Node.js…"
if ! install_one nodejs-lts; then
  warn "Пакет nodejs-lts недоступен в этом репозитории — пробую nodejs"
  install_one nodejs || { pkg_dpkg_help; die "Node.js обязателен и не установился."; }
fi

say "Устанавливаю PostgreSQL и служебные пакеты…"
MISSING_REQ=()
for p in git rsync curl openssl postgresql termux-services; do
  install_one "$p" || MISSING_REQ+=("$p")
done
if (( ${#MISSING_REQ[@]} > 0 )); then
  pkg_dpkg_help
  die "Обязательные пакеты не установились: ${MISSING_REQ[*]}"
fi

for p in termux-api iproute2 ffmpeg; do
  install_one "$p" || warn "Необязательный пакет $p не установился — продолжаю без него."
done

PG_VERSION_FULL="$(postgres --version | awk '{print $3}')"
PG_VERSION_MAJOR="${PG_VERSION_FULL%%.*}"
[[ "$PG_VERSION_MAJOR" == "18" ]] || die "Требуется PostgreSQL 18.x, но репозиторий Termux дал ${PG_VERSION_FULL}. Выполните termux-change-repo, выберите актуальное официальное зеркало и перезапустите установщик."
ok "Node $(node -v), npm $(npm -v), PostgreSQL ${PG_VERSION_FULL}"

# Повторная установка: останавливаем только собственные сервисы до замены .next.
# Другие Termux-проекты и стандартный PostgreSQL не затрагиваются.
export SVDIR="$SERVICE_DIR"
export LOGDIR="$PREFIX/var/log"
if [[ -d "$SERVICE_DIR/kagura-konspekt" ]]; then
  if [[ -f "$PREFIX/etc/profile.d/start-services.sh" ]]; then
    # shellcheck disable=SC1091
    source "$PREFIX/etc/profile.d/start-services.sh"
    sleep 1
  fi
  sv down kagura-konspekt >/dev/null 2>&1 || true
  sv down kagura-db >/dev/null 2>&1 || true
fi

# LibreOffice есть в официальном x11-репозитории Termux. Он нужен только для
# DOC/DOCX/XLS/XLSX/PPT/PPTX/ODT/ODS/ODP → PDF; остальные функции от него не зависят.
say "Подключаю официальный X11-репозиторий для LibreOffice…"
if install_one x11-repo && install_one libreoffice; then
  ok "LibreOffice установлен — офисные документы можно читать внутри сайта"
else
  warn "LibreOffice установить не удалось. PDF/Markdown/медиа будут работать; офисные файлы можно скачивать."
fi

# Ollama официально доступна в Termux на arm64. qwen3:8b требует около 5 ГБ
# на диске и примерно 6–8 ГБ свободной RAM во время генерации.
OLLAMA_AVAILABLE=0
if [[ "${KAGURA_SKIP_OLLAMA:-0}" == "1" ]]; then
  warn "Ollama пропущена: KAGURA_SKIP_OLLAMA=1"
elif [[ "$(uname -m)" == "aarch64" || "$(uname -m)" == "arm64" ]]; then
  say "Устанавливаю Ollama из официального репозитория Termux…"
  if install_one ollama; then
    OLLAMA_AVAILABLE=1
    ok "Ollama установлена"
  else
    warn "Пакет Ollama недоступен. Приложение будет работать без локального ИИ."
  fi
else
  warn "Ollama в Termux поддерживает arm64; текущая архитектура $(uname -m) — ИИ пропущен."
fi

# ---------- 2. Доступ к общей памяти ----------
if [[ ! -d "$HOME/storage/shared" ]]; then
  say "Запрашиваю доступ к общей памяти Android…"
  termux-setup-storage || true
  warn "Разрешите Termux доступ к файлам в системном диалоге. Жду до 20 секунд…"
  for _ in $(seq 1 20); do
    [[ -d "$HOME/storage/shared" ]] && break
    sleep 1
  done
fi

if [[ -n "${KAGURA_FILES_DIR:-}" ]]; then
  FILES_DIR="$KAGURA_FILES_DIR"
elif [[ -d "$HOME/storage/shared" ]]; then
  FILES_DIR="$HOME/storage/shared/KAGURA_KONSPEKT"
else
  FILES_DIR="$STATE_DIR/files"
  warn "Доступ к общей памяти не получен: файлы будут в $FILES_DIR"
  warn "Позже выполните termux-setup-storage и задайте KAGURA_FILES_DIR."
fi
mkdir -p "$FILES_DIR" "$STATE_DIR"
ok "Файловое хранилище: $FILES_DIR"

# ---------- 3. Секреты (повторный запуск безопасен) ----------
# Сохраняем существующий пароль БД при повторном запуске, чтобы не ломать .env.
EXISTING_ENV="$APP_DIR/.env"
DB_PASS=""
SESSION_SECRET=""
if [[ -f "$EXISTING_ENV" ]]; then
  EXISTING_URL="$(grep -m1 '^DATABASE_URL=' "$EXISTING_ENV" 2>/dev/null || true)"
  DB_PASS="$(printf '%s' "$EXISTING_URL" | sed -n 's#.*kagura:\([^@]*\)@127\.0\.0\.1:55432.*#\1#p')"
  SESSION_SECRET="$(grep -m1 '^SESSION_SECRET=' "$EXISTING_ENV" 2>/dev/null | cut -d= -f2- || true)"
fi
DB_PASS="${DB_PASS:-$(openssl rand -hex 18)}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

# ---------- 4. Копирование проекта ----------
say "Копирую проект в $APP_DIR…"
mkdir -p "$APP_DIR"
if [[ "$(realpath "$SRC")" != "$(realpath "$APP_DIR")" ]]; then
  rsync -a --delete \
    --exclude node_modules --exclude .next --exclude data \
    --exclude .git --exclude .env \
    "$SRC/" "$APP_DIR/"
else
  ok "Установщик уже запущен из каталога приложения — копирование не требуется"
fi

cat > "$APP_DIR/.env" <<ENV
# KAGURA•KONSPEKT / Termux — генерируется install-termux.sh
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
PORT=${APP_PORT}
FILES_ROOT=${FILES_DIR}
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=${MODEL}
ADMIN_INITIAL_USERNAME_B64=${ADMIN_USERNAME_B64}
ADMIN_INITIAL_PASSWORD_B64=${ADMIN_PASSWORD_B64}
ENV
chmod 600 "$APP_DIR/.env"

# ---------- 5. Полностью отдельный PostgreSQL ----------
say "Готовлю отдельный PostgreSQL-кластер: $DB_DIR"
if [[ ! -f "$DB_DIR/PG_VERSION" ]]; then
  mkdir -p "$DB_DIR"
  chmod 700 "$DB_DIR"
  initdb --locale=C --encoding=UTF8 -D "$DB_DIR"
  ok "Новый кластер инициализирован"
else
  ok "Кластер уже существует — initdb пропущен"
fi

# Основной postgresql.conf не переписываем. Подключаем свой файл один раз,
# а его содержимое можно безопасно обновлять при повторной установке.
if ! grep -Fq "include_if_exists = 'kagura.conf'" "$DB_DIR/postgresql.conf"; then
  printf "\n# KAGURA KONSPEKT isolated configuration\ninclude_if_exists = 'kagura.conf'\n" >> "$DB_DIR/postgresql.conf"
fi
cat > "$DB_DIR/kagura.conf" <<CONF
port = ${DB_PORT}
listen_addresses = '127.0.0.1'
unix_socket_directories = '${DB_DIR}'
max_connections = 30
shared_buffers = 64MB
dynamic_shared_memory_type = posix
logging_collector = off
CONF

# Сокет доступен текущему Termux-пользователю; по TCP разрешена только роль приложения.
cat > "$DB_DIR/pg_hba.conf" <<HBA
# TYPE  DATABASE  USER      ADDRESS         METHOD
local   all       all                       trust
host    all       ${DB_USER}  127.0.0.1/32  scram-sha-256
host    all       all       127.0.0.1/32    reject
host    all       all       ::1/128         reject
HBA
chmod 600 "$DB_DIR/pg_hba.conf"

# Для настройки запускаем БД напрямую. Если уже запущена именно эта БД — переиспользуем.
if ! pg_ctl -D "$DB_DIR" status >/dev/null 2>&1; then
  say "Запускаю кластер на время настройки…"
  pg_ctl -D "$DB_DIR" -l "$DB_LOG" -w -t 60 start || {
    tail -n 30 "$DB_LOG" 2>/dev/null || true
    die "PostgreSQL не запустился. Возможно, порт ${DB_PORT} занят."
  }
fi
pg_isready -h 127.0.0.1 -p "$DB_PORT" -q || die "База не отвечает на 127.0.0.1:${DB_PORT}"

say "Создаю/обновляю роль и базу $DB_NAME…"
# Подключение для администрирования идёт через собственный Unix-сокет кластера.
psql -h "$DB_DIR" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN;
  END IF;
END
\$\$;
ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
SQL
if ! psql -h "$DB_DIR" -p "$DB_PORT" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  createdb -h "$DB_DIR" -p "$DB_PORT" -O "$DB_USER" "$DB_NAME"
fi
ok "БД: 127.0.0.1:${DB_PORT}/${DB_NAME}; файлы: $DB_DIR"

# ---------- 6. npm, Drizzle, сборка ----------
cd "$APP_DIR"
say "Устанавливаю npm-зависимости…"
npm install

say "Применяю Drizzle-схему к отдельной БД…"
npx drizzle-kit push --force

say "Собираю Next.js 16 через webpack…"
# Turbopack не предоставляет официальной Android/Termux binding для Next 16.
# Webpack использует поддерживаемый WASM fallback и даёт ту же production-сборку.
npx next build --webpack
ok "Production-сборка готова"

# ---------- 7. runit / termux-services ----------
say "Создаю сервисы Termux (runit)…"
mkdir -p \
  "$SERVICE_DIR/kagura-db/log" \
  "$SERVICE_DIR/kagura-konspekt/log" \
  "$SERVICE_LOG_DIR/kagura-db" \
  "$SERVICE_LOG_DIR/kagura-konspekt"

cat > "$SERVICE_DIR/kagura-db/run" <<RUN
#!${PREFIX}/bin/sh
exec 2>&1
exec ${PREFIX}/bin/postgres -D '${DB_DIR}'
RUN
cat > "$SERVICE_DIR/kagura-db/log/run" <<RUN
#!${PREFIX}/bin/sh
exec ${PREFIX}/bin/svlogd -tt '${SERVICE_LOG_DIR}/kagura-db'
RUN

cat > "$SERVICE_DIR/kagura-konspekt/run" <<RUN
#!${PREFIX}/bin/sh
exec 2>&1
while ! ${PREFIX}/bin/pg_isready -h 127.0.0.1 -p ${DB_PORT} -q; do sleep 1; done
cd '${APP_DIR}' || exit 1
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
exec ${PREFIX}/bin/npx next start -H 0.0.0.0 -p ${APP_PORT}
RUN
cat > "$SERVICE_DIR/kagura-konspekt/log/run" <<RUN
#!${PREFIX}/bin/sh
exec ${PREFIX}/bin/svlogd -tt '${SERVICE_LOG_DIR}/kagura-konspekt'
RUN

chmod 700 \
  "$SERVICE_DIR/kagura-db/run" "$SERVICE_DIR/kagura-db/log/run" \
  "$SERVICE_DIR/kagura-konspekt/run" "$SERVICE_DIR/kagura-konspekt/log/run"

if [[ "$OLLAMA_AVAILABLE" == "1" ]]; then
  mkdir -p "$SERVICE_DIR/kagura-ollama/log" "$SERVICE_LOG_DIR/kagura-ollama"
  cat > "$SERVICE_DIR/kagura-ollama/run" <<RUN
#!${PREFIX}/bin/sh
exec 2>&1
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_KEEP_ALIVE=24h
exec ${PREFIX}/bin/ollama serve
RUN
  cat > "$SERVICE_DIR/kagura-ollama/log/run" <<RUN
#!${PREFIX}/bin/sh
exec ${PREFIX}/bin/svlogd -tt '${SERVICE_LOG_DIR}/kagura-ollama'
RUN
  chmod 700 "$SERVICE_DIR/kagura-ollama/run" "$SERVICE_DIR/kagura-ollama/log/run"
fi

# Передаём БД от временного pg_ctl сервису runit.
pg_ctl -D "$DB_DIR" -m fast -w stop >/dev/null 2>&1 || true
export SVDIR="$SERVICE_DIR"
export LOGDIR="$PREFIX/var/log"
# Запускает service-daemon в текущей сессии; после перезапуска Termux это делает profile.d.
if [[ -f "$PREFIX/etc/profile.d/start-services.sh" ]]; then
  # shellcheck disable=SC1091
  source "$PREFIX/etc/profile.d/start-services.sh"
else
  (service-daemon start >/dev/null 2>&1 &)
fi
sleep 2
rm -f "$SERVICE_DIR/kagura-db/down" "$SERVICE_DIR/kagura-konspekt/down"
sv up kagura-db || true

say "Жду отдельную БД под управлением runit…"
for i in $(seq 1 45); do
  pg_isready -h 127.0.0.1 -p "$DB_PORT" -q && break
  sleep 1
  [[ "$i" -eq 45 ]] && {
    tail -n 30 "$SERVICE_LOG_DIR/kagura-db/current" 2>/dev/null || true
    die "Сервис kagura-db не запустился"
  }
done

sv up kagura-konspekt || true

if [[ "$OLLAMA_AVAILABLE" == "1" ]]; then
  rm -f "$SERVICE_DIR/kagura-ollama/down"
  sv up kagura-ollama || true
  say "Жду Ollama…"
  for _ in $(seq 1 45); do
    curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done

  # Не валим всю установку, если телефону не хватает RAM/места для 8B.
  say "Загружаю ${MODEL} (≈5 ГБ на диске; генерация требует около 6–8 ГБ RAM)…"
  if ollama pull "$MODEL"; then
    ok "Модель $MODEL готова"
  else
    warn "Не удалось загрузить $MODEL. Приложение уже работает; повторите позже: ollama pull $MODEL"
  fi
fi

# ---------- 8. Termux:Boot ----------
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/kagura-konspekt" <<BOOT
#!${PREFIX}/bin/sh
# Выполняется приложением Termux:Boot после загрузки Android.
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
export PREFIX='${PREFIX}'
export HOME='${HOME}'
export SVDIR='${SERVICE_DIR}'
export LOGDIR='${PREFIX}/var/log'
. '${PREFIX}/etc/profile.d/start-services.sh'
sleep 3
sv up kagura-db || true
sv up kagura-konspekt || true
$(if [[ "$OLLAMA_AVAILABLE" == "1" ]]; then echo 'sv up kagura-ollama || true'; else echo ':'; fi)
BOOT
chmod 700 "$HOME/.termux/boot/kagura-konspekt"

# Удобные ручные команды.
cat > "$APP_DIR/start-termux.sh" <<START
#!${PREFIX}/bin/bash
export SVDIR='${SERVICE_DIR}' LOGDIR='${PREFIX}/var/log'
. '${PREFIX}/etc/profile.d/start-services.sh'
sleep 1
sv up kagura-db
sv up kagura-konspekt
$(if [[ "$OLLAMA_AVAILABLE" == "1" ]]; then echo 'sv up kagura-ollama || true'; fi)
echo 'KAGURA•KONSPEKT: http://127.0.0.1:${APP_PORT}'
START
cat > "$APP_DIR/stop-termux.sh" <<STOP
#!${PREFIX}/bin/bash
export SVDIR='${SERVICE_DIR}'
sv down kagura-konspekt || true
$(if [[ "$OLLAMA_AVAILABLE" == "1" ]]; then echo 'sv down kagura-ollama || true'; fi)
sv down kagura-db || true
STOP
chmod 700 "$APP_DIR/start-termux.sh" "$APP_DIR/stop-termux.sh"

# ---------- 9. Healthcheck ----------
say "Жду приложение на порту $APP_PORT…"
APP_OK=0
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    APP_OK=1
    break
  fi
  sleep 1
  if [[ "$i" -eq 60 ]]; then
    warn "Последние строки журнала приложения:"
    tail -n 40 "$SERVICE_LOG_DIR/kagura-konspekt/current" 2>/dev/null || true
  fi
done
[[ "$APP_OK" == "1" ]] || die "Приложение не ответило на /api/health"
ok "Приложение отвечает: http://127.0.0.1:${APP_PORT}"

say "Создаю первого администратора из введённых учётных данных…"
BOOTSTRAP_JSON="$(ADMIN_USERNAME_B64="$ADMIN_USERNAME_B64" ADMIN_PASSWORD_B64="$ADMIN_PASSWORD_B64" node -e 'process.stdout.write(JSON.stringify({username:Buffer.from(process.env.ADMIN_USERNAME_B64,"base64").toString("utf8"),password:Buffer.from(process.env.ADMIN_PASSWORD_B64,"base64").toString("utf8")}))')"
BOOTSTRAP_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${APP_PORT}/api/auth/login" -H 'Content-Type: application/json' --data "$BOOTSTRAP_JSON" || true)"
if [[ "$BOOTSTRAP_RESPONSE" != *'"user"'* ]]; then
  warn "Не удалось создать/проверить первого администратора."
  warn "Ответ приложения: ${BOOTSTRAP_RESPONSE:-<пусто>}"
  die "Установка остановлена: учётные данные администратора не были подтверждены."
fi
sed -i '/^ADMIN_INITIAL_USERNAME_B64=/d; /^ADMIN_INITIAL_PASSWORD_B64=/d' "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
unset ADMIN_USERNAME_B64 ADMIN_PASSWORD_B64
ok "Первый администратор создан; начальные секреты удалены из .env"

PHONE_IP="$(ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {sub(/\/.*/,"",$2); print $2; exit}')"

printf '\n'
ok "Установка KAGURA•KONSPEKT для Termux завершена!"
printf '\n'
printf '  На телефоне:      http://127.0.0.1:%s\n' "$APP_PORT"
[[ -n "$PHONE_IP" ]] && printf '  Из локальной сети: http://%s:%s\n' "$PHONE_IP" "$APP_PORT"
printf '  Администратор:    %s\n' "$ADMIN_USERNAME"
printf '  Пароль:           задан вами при установке\n'
printf '  Проект:           %s\n' "$APP_DIR"
printf '  Файлы:            %s\n' "$FILES_DIR"
printf '  База:             127.0.0.1:%s/%s\n' "$DB_PORT" "$DB_NAME"
printf '  Файлы БД:         %s\n' "$DB_DIR"
printf '  Старт вручную:    %s/start-termux.sh\n' "$APP_DIR"
printf '  Стоп вручную:     %s/stop-termux.sh\n' "$APP_DIR"
printf '  Логи приложения:  %s/kagura-konspekt/current\n' "$SERVICE_LOG_DIR"
printf '\n'
warn "Для автозапуска после перезагрузки установите Termux:Boot из того же источника, что и Termux, откройте его один раз и отключите оптимизацию батареи для Termux/Termux:Boot. Boot-скрипт уже создан."
warn "Android может останавливать фоновые процессы при жёсткой экономии батареи. Сервис использует termux-wake-lock, но разрешение Termux:API и отключение оптимизации всё равно рекомендуются."
unset ADMIN_USERNAME

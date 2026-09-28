#!/usr/bin/env bash
# ============================================================
#  KAGURA•KONSPEKT — автоустановщик для Ubuntu 24.04 LTS
#
#  Что делает:
#   1. Ставит Node.js LTS (NodeSource), npm, PostgreSQL 16,
#      Ollama, LibreOffice, ffmpeg
#   2. Инициализирует ОТДЕЛЬНЫЙ кластер PostgreSQL (порт 55432,
#      каталог /var/lib/kagura_db) — системный кластер на 5432
#      НЕ трогается
#   3. Копирует проект в /opt/KAGURA_KONSPEKT
#   4. Создаёт файловое хранилище /srv/KAGURA_KONSPEKT
#   5. Собирает приложение (Next.js, порт 2315)
#   6. Настраивает systemd: ollama, kagura-db, kagura-konspekt,
#      kagura-proxy (порт 2121)
#   7. Скачивает модель qwen3:8b для ИИ-анализатора
#   8. Создаёт первого администратора из введённых учётных данных
#
#  Запуск:   chmod +x install.sh && ./install.sh
# ============================================================
set -euo pipefail

GREEN=$'\033[0;32m'; BLUE=$'\033[0;34m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
say()  { echo "${BLUE}[KAGURA]${NC} $*"; }
ok()   { echo "${GREEN}[ OK ]${NC} $*"; }
warn() { echo "${YELLOW}[WARN]${NC} $*"; }
die()  { echo "${RED}[FAIL]${NC} $*"; exit 1; }

APP_DIR=/opt/KAGURA_KONSPEKT
FILES_DIR=/srv/KAGURA_KONSPEKT
PORT=2315
DB_NAME=kagura_db
DB_USER=kagura
DB_PORT=55432                 # отдельный порт: стандартный 5432 и его кластер НЕ трогаем
DB_DIR=/var/lib/kagura_db     # отдельное расположение файлов кластера
DB_PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24)
SESSION_SECRET=$(head -c 40 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 40)

[[ $EUID -eq 0 ]] && die "Запускайте от обычного пользователя (sudo будет запрошен при необходимости)."

echo
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   KAGURA•KONSPEKT — установка на Ubuntu      ║"
echo "  ║   Next.js · PostgreSQL · Drizzle · Ollama    ║"
echo "  ╚══════════════════════════════════════════════╝"
echo
read -r -p "Продолжить установку? [y/N] " ans
[[ "${ans:-n}" =~ ^[YyДд]$ ]] || die "Отменено пользователем."

echo
echo "Введите учётные данные первого администратора."
echo "Они используются только для первичного создания аккаунта и не имеют значений по умолчанию."
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
ADMIN_USERNAME_B64="$(printf '%s' "$ADMIN_USERNAME" | base64 -w0)"
ADMIN_PASSWORD_B64="$(printf '%s' "$ADMIN_PASSWORD" | base64 -w0)"
unset ADMIN_PASSWORD

# ---------- 1. Пакеты ----------
say "Обновляю индекс пакетов…"
sudo apt-get update -qq

say "Устанавливаю базовые пакеты…"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl ca-certificates gnupg lsb-release locales \
  build-essential rsync unzip git \
  postgresql postgresql-common \
  libreoffice ffmpeg

# Node.js LTS через NodeSource (в репозиториях Ubuntu версия устаревшая).
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
  say "Устанавливаю Node.js LTS через NodeSource…"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
ok "Пакеты установлены: $(node -v), npm $(npm -v)"

# Ollama — официальный установщик (создаёт systemd-сервис и пользователя ollama).
if ! command -v ollama >/dev/null 2>&1; then
  say "Устанавливаю Ollama…"
  curl -fsSL https://ollama.com/install.sh | sh
fi
ok "Ollama: $(ollama --version 2>/dev/null | head -n1 || echo 'установлен')"

# Определяем версию PostgreSQL, установленную в системе (в Ubuntu бинарники лежат
# в /usr/lib/postgresql/<major>/bin/, а не в /usr/bin/, как в Arch).
PG_VER="$(ls /usr/lib/postgresql/ 2>/dev/null | sort -V | tail -n1 || true)"
[[ -n "$PG_VER" ]] || die "Не удалось определить установленную версию PostgreSQL."
PG_BIN="/usr/lib/postgresql/${PG_VER}/bin"
ok "PostgreSQL ${PG_VER} (бинарники: ${PG_BIN})"

# При повторной установке не оставляем Next.js обслуживать каталог во время
# замены .next. Останавливаем только наш сервис; чужие процессы не трогаем.
sudo systemctl stop kagura-konspekt.service 2>/dev/null || true

# ---------- 2. ОТДЕЛЬНЫЙ экземпляр PostgreSQL ----------
# Собственный кластер: своя директория данных (${DB_DIR}) и свой порт (${DB_PORT}).
# Системный PostgreSQL (/var/lib/postgresql/${PG_VER}/main, порт 5432) НЕ изменяется
# вообще: ни initdb в нём, ни его systemd-сервис не трогаем.
say "Проверяю локаль ru_RU.UTF-8 для initdb…"
if ! locale -a 2>/dev/null | grep -qi '^ru_RU\.utf-\?8$'; then
  sudo locale-gen ru_RU.UTF-8 >/dev/null 2>&1 || true
fi
if locale -a 2>/dev/null | grep -qi '^ru_RU\.utf-\?8$'; then
  DB_LOCALE="ru_RU.UTF-8"
else
  DB_LOCALE="C.UTF-8"
  warn "Локаль ru_RU.UTF-8 недоступна — использую ${DB_LOCALE}"
fi

say "Создаю отдельный кластер PostgreSQL в ${DB_DIR} (порт ${DB_PORT})…"
if sudo test -f "${DB_DIR}/PG_VERSION"; then
  ok "Кластер ${DB_DIR} уже инициализирован — пропускаю initdb"
else
  sudo install -d -o postgres -g postgres -m 700 "${DB_DIR}"
  sudo -u postgres "${PG_BIN}/initdb" --locale="${DB_LOCALE}" -E UTF8 -D "${DB_DIR}"
  ok "Кластер инициализирован в ${DB_DIR}"
fi

say "Настраиваю порт ${DB_PORT} и прослушивание localhost…"
if sudo grep -qE "^port\s*=" "${DB_DIR}/postgresql.conf"; then
  sudo sed -i -E "s/^#?port\s*=.*/port = ${DB_PORT}/" "${DB_DIR}/postgresql.conf"
  sudo sed -i -E "s/^#?listen_addresses\s*=.*/listen_addresses = '127.0.0.1'/" "${DB_DIR}/postgresql.conf"
else
  sudo bash -c "cat >> '${DB_DIR}/postgresql.conf'" <<CONF

# === KAGURA•KONSPEKT: isolated instance ===
port = ${DB_PORT}
listen_addresses = '127.0.0.1'
CONF
fi

# Unix-сокеты — тоже только в нашей директории (полная изоляция, без /var/run/postgresql)
sudo sed -i -E "s|^#?unix_socket_directories\s*=.*|unix_socket_directories = '${DB_DIR}'|" "${DB_DIR}/postgresql.conf"
if ! sudo grep -q "^unix_socket_directories" "${DB_DIR}/postgresql.conf"; then
  echo "unix_socket_directories = '${DB_DIR}'" | sudo tee -a "${DB_DIR}/postgresql.conf" >/dev/null
fi

# Локальный TCP-доступ приложения (scram-sha-256)
if ! sudo grep -q "kagura-konspekt" "${DB_DIR}/pg_hba.conf"; then
  sudo bash -c "cat >> '${DB_DIR}/pg_hba.conf'" <<HBA

# kagura-konspekt (локальный доступ приложения)
host    all    kagura    127.0.0.1/32    scram-sha-256
HBA
fi

say "Создаю systemd-сервис отдельного кластера (kagura-db.service)…"
sudo tee /etc/systemd/system/kagura-db.service >/dev/null <<UNIT
[Unit]
Description=KAGURA-KONSPEKT PostgreSQL (separate cluster, port ${DB_PORT})
After=network.target

[Service]
Type=forking
User=postgres
Group=postgres
ExecStart=${PG_BIN}/pg_ctl start -D ${DB_DIR} -l ${DB_DIR}/server.log -s -w -t 90
ExecStop=${PG_BIN}/pg_ctl stop -D ${DB_DIR} -s -m fast
ExecReload=${PG_BIN}/pg_ctl reload -D ${DB_DIR} -s
TimeoutSec=90

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now kagura-db

say "Жду готовности кластера (порт ${DB_PORT})…"
for i in $(seq 1 30); do
  if sudo -u postgres "${PG_BIN}/pg_isready" -h 127.0.0.1 -p "${DB_PORT}" -q; then break; fi
  sleep 1
  [[ $i -eq 30 ]] && die "Кластер PostgreSQL не поднялся на порту ${DB_PORT}. Смотрите ${DB_DIR}/server.log"
done

say "Создаю роль и базу '${DB_NAME}' в отдельном кластере…"
sudo -u postgres "${PG_BIN}/psql" -h 127.0.0.1 -p "${DB_PORT}" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
SQL
if ! sudo -u postgres "${PG_BIN}/psql" -h 127.0.0.1 -p "${DB_PORT}" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres "${PG_BIN}/createdb" -h 127.0.0.1 -p "${DB_PORT}" -O "${DB_USER}" "${DB_NAME}"
fi
ok "Отдельная база данных готова: 127.0.0.1:${DB_PORT}/${DB_NAME}"

# ---------- 3. Копирование проекта ----------
say "Копирую проект в ${APP_DIR}…"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo mkdir -p "${APP_DIR}"
sudo rsync -a --delete \
  --exclude node_modules --exclude .next --exclude data \
  --exclude .git "${SRC}/" "${APP_DIR}/"
sudo chown -R "$USER:$USER" "${APP_DIR}"

# ---------- 4. Файловое хранилище ----------
say "Создаю файловое хранилище ${FILES_DIR}…"
sudo mkdir -p "${FILES_DIR}"
sudo chown -R "$USER:$USER" "${FILES_DIR}"
chmod 755 "${FILES_DIR}"

# ---------- 5. Окружение и сборка ----------
say "Пишу .env (случайные секреты сгенерированы)…"
cat > "${APP_DIR}/.env" <<ENV
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
PORT=${PORT}
FILES_ROOT=${FILES_DIR}
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
ADMIN_INITIAL_USERNAME_B64=${ADMIN_USERNAME_B64}
ADMIN_INITIAL_PASSWORD_B64=${ADMIN_PASSWORD_B64}
ENV
chmod 600 "${APP_DIR}/.env"

say "Устанавливаю зависимости (npm install)…"
cd "${APP_DIR}"
npm install
say "Применяю схему базы данных (адрес берётся из .env → 127.0.0.1:${DB_PORT})…"
npx drizzle-kit push --force
say "Собираю приложение…"
npm run build
ok "Приложение собрано"

# ---------- 6. Ollama + модель ----------
# Настраиваем один systemd-сервис. Не запускаем `ollama serve` вручную:
# bind/address already in use означает, что экземпляр уже слушает порт 11434.
say "Настраиваю Ollama (один экземпляр, 127.0.0.1:11434)…"
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/kagura.conf >/dev/null <<UNIT
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_KEEP_ALIVE=24h"
UNIT
# Удаляем старый drop-in с ошибочным ExecStartPost, если он остался от прежней версии.
sudo rm -f /etc/systemd/system/ollama.service.d/keep-model.conf
sudo systemctl daemon-reload
sudo systemctl enable ollama

OLLAMA_READY=0
if curl -fsS --max-time 4 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  OLLAMA_READY=1
  ok "Ollama API уже запущен — второй экземпляр не требуется"
else
  # Если сервис уже был активен, restart применит новый drop-in; иначе start.
  if sudo systemctl is-active --quiet ollama; then
    sudo systemctl restart ollama
  else
    sudo systemctl start ollama || true
  fi
  say "Жду Ollama API…"
  for i in $(seq 1 45); do
    if curl -fsS --max-time 3 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
      OLLAMA_READY=1
      break
    fi
    sleep 1
  done
fi

if [[ "$OLLAMA_READY" == "1" ]]; then
  OLLAMA_VERSION=$(curl -fsS --max-time 4 http://127.0.0.1:11434/api/version 2>/dev/null || true)
  ok "Ollama отвечает: ${OLLAMA_VERSION:-версия не определена}"
  say "Загружаю модель qwen3:8b (около 5 ГБ)…"
  ollama pull qwen3:8b || warn "Модель не загружена — выполните позже: ollama pull qwen3:8b"
else
  warn "На 127.0.0.1:11434 нет рабочего Ollama API. Диагностика сервиса:"
  sudo systemctl status ollama --no-pager -l || true
  warn "Если порт занят другим процессом: ss -ltnp 'sport = :11434'"
  warn "Приложение установится, но ИИ не заработает до исправления Ollama."
fi

# ---------- 6.5. Обратный прокси на порту 2121 ----------
# Открывает в приложении сайты, которые запрещают встраивание
# (X-Frame-Options / CSP). Доступ только вошедшему пользователю.
say "Создаю сервис обратного прокси (порт 2121)…"
sudo tee /etc/systemd/system/kagura-proxy.service >/dev/null <<UNIT
[Unit]
Description=KAGURA-KONSPEKT — обратный прокси для встраивания сервисов
After=network.target kagura-konspekt.service
Wants=kagura-konspekt.service

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PROXY_PORT=2121
Environment=APP_URL=http://127.0.0.1:${PORT}
Environment="NO_PROXY=127.0.0.1,localhost,::1"
ExecStart=/usr/bin/node ${APP_DIR}/proxy-2121.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# ---------- 7. systemd-сервис приложения ----------
say "Создаю systemd-сервис kagura-konspekt (порт ${PORT})…"
sudo tee /etc/systemd/system/kagura-konspekt.service >/dev/null <<UNIT
[Unit]
Description=KAGURA-KONSPEKT — база данных конспектов (Next.js)
After=network.target kagura-db.service ollama.service
Requires=kagura-db.service
Wants=ollama.service

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=${PORT}
# Гарантируем прямое локальное соединение даже при системном HTTP(S)_PROXY.
Environment="NO_PROXY=127.0.0.1,localhost,::1"
Environment="no_proxy=127.0.0.1,localhost,::1"
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable kagura-konspekt
sudo systemctl restart kagura-konspekt
sudo systemctl enable kagura-proxy
sudo systemctl restart kagura-proxy

say "Жду запуска приложения (порт ${PORT})…"
APP_OK=0
for i in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    APP_OK=1
    break
  fi
  sleep 1
done
if [[ "$APP_OK" != "1" ]]; then
  warn "Приложение не ответило за 45 секунд. Диагностика:"
  sudo journalctl -u kagura-konspekt -n 30 --no-pager || true
  die "Сервис не поднялся. Смотрите журнал выше: journalctl -u kagura-konspekt -f"
fi
ok "Приложение запущено и отвечает на /api/health"

say "Создаю первого администратора из введённых учётных данных…"
BOOTSTRAP_JSON="$(ADMIN_USERNAME_B64="$ADMIN_USERNAME_B64" ADMIN_PASSWORD_B64="$ADMIN_PASSWORD_B64" node -e 'process.stdout.write(JSON.stringify({username:Buffer.from(process.env.ADMIN_USERNAME_B64,"base64").toString("utf8"),password:Buffer.from(process.env.ADMIN_PASSWORD_B64,"base64").toString("utf8")}))')"
BOOTSTRAP_RESPONSE="$(curl -fsS -X POST "http://127.0.0.1:${PORT}/api/auth/login" -H 'Content-Type: application/json' --data "$BOOTSTRAP_JSON" || true)"
if [[ "$BOOTSTRAP_RESPONSE" != *'"user"'* ]]; then
  warn "Не удалось создать/проверить первого администратора."
  warn "Ответ приложения: ${BOOTSTRAP_RESPONSE:-<пусто>}"
  die "Установка остановлена: учётные данные администратора не были подтверждены."
fi
# После успешного первичного seed пароль больше не нужен приложению.
sed -i '/^ADMIN_INITIAL_USERNAME_B64=/d; /^ADMIN_INITIAL_PASSWORD_B64=/d' "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
unset ADMIN_USERNAME_B64 ADMIN_PASSWORD_B64
ok "Первый администратор создан; начальные секреты удалены из .env"

echo
ok "Установка завершена!"
echo
echo "  Адрес:            http://localhost:${PORT}  (и http://<IP-ноутбука>:${PORT} из локальной сети)"
echo "  Администратор:    ${ADMIN_USERNAME:-<введённый при установке>}"
echo "  Пароль:           задан вами при установке"
echo "  Проект:           ${APP_DIR}"
echo "  Файлы:            ${FILES_DIR}  (подпапка с именем каждого пользователя создаётся автоматически)"
echo "  База данных:      отдельный кластер PostgreSQL"
echo "                    · адрес:   127.0.0.1:${DB_PORT}  (ваш кластер на 5432 не тронут)"
echo "                    · файлы:   ${DB_DIR}"
echo "                    · сервис:  kagura-db.service"
echo "  Обратный прокси:  127.0.0.1:2121 (сервис kagura-proxy)"
echo "  Логи:             journalctl -u kagura-konspekt -f"
echo
warn "Откройте порт ${PORT} в файрволе, если нужен доступ с телефона: sudo ufw allow ${PORT}/tcp   (или настройте firewalld/iptables)"
unset ADMIN_USERNAME

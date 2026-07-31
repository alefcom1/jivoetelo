#!/usr/bin/env bash
# Выкатка на сервере. Скрипт запускается НЕ у вас на машине, а на VPS —
# его туда передаёт workflow .github/workflows/deploy.yml по SSH.
#
# Ровно те же шаги можно выполнить руками, если автодеплой почему-то не
# сработал:  bash deploy/remote-deploy.sh <хеш коммита>
#
# Переменные окружения (workflow подставляет их сам):
#   DEPLOY_PATH  — каталог с кодом на сервере (по умолчанию /root/jivoetelo)
#   HEALTH_URL   — адрес проверки живости (по умолчанию берётся из .env)
set -euo pipefail

TARGET_SHA="${1:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/jivoetelo}"

if [ -z "$TARGET_SHA" ]; then
  echo "Не передан коммит для выкатки." >&2
  exit 1
fi

cd "$DEPLOY_PATH"

# Запоминаем, что стояло до выкатки: если новая версия не поднимется, это
# единственный способ быстро понять, куда возвращаться.
PREVIOUS_SHA="$(git rev-parse HEAD)"
echo "▶ Было: $PREVIOUS_SHA"
echo "▶ Ставим: $TARGET_SHA"

echo "▶ Забираем код"
git fetch origin --quiet
# reset --hard, а не pull: на сервере не должно быть своих правок в
# отслеживаемых файлах, а .env лежит вне git и не пострадает.
git reset --hard "$TARGET_SHA" --quiet

if [ ! -f .env ]; then
  echo "Нет файла .env — сервер не знает пароль базы и токены." >&2
  echo "Создайте его из .env.example один раз, вручную: он вне git специально." >&2
  exit 1
fi

# Порт берём из .env, а не из константы.
#
# На этом сервере рядом живёт другое приложение, и 3000 занято им; наш
# контейнер публикуется на APP_HOST_PORT (см. docker-compose.yml). Проверка
# живости, прибитая к 3000, стучалась бы к соседу — и это худший вид ошибки:
# сосед отвечает, выкатка рапортует «приложение живо», а живо не наше.
#
# tail -n1, а не первое совпадение: при повторе строки docker compose берёт
# последнюю, и проверка должна смотреть туда же, куда смотрит compose.
APP_HOST_PORT="$(sed -n 's/^APP_HOST_PORT=//p' .env | tail -n1 | tr -d "\"' \r")"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_HOST_PORT:-3000}/api/health}"
echo "▶ Проверять живость будем по $HEALTH_URL"

# Проверка окружения не обязательна, но если Node на сервере есть — она
# ловит забытый токен прокси до того, как это заметят пользователи.
if command -v node > /dev/null 2>&1; then
  echo "▶ Проверяем окружение"
  node scripts/preflight.mjs || {
    echo "Проверка окружения нашла проблемы — выкатку останавливаю." >&2
    exit 1
  }
fi

echo "▶ Собираем и поднимаем контейнеры"
docker compose up -d --build

echo "▶ Применяем миграции"
bash deploy/migrate.sh

echo "▶ Ждём, пока приложение ответит"
for attempt in $(seq 1 30); do
  # Мало получить 200 — важно получить его от нашего приложения. Ответ
  # проверяем по телу: чужой сервис на том же порту тоже умеет отвечать 200.
  if curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    echo "✔ Приложение отвечает (попытка $attempt)"
    echo "▶ Убираем старые образы"
    docker image prune -f > /dev/null 2>&1 || true
    echo "✔ Готово: $TARGET_SHA"
    exit 0
  fi
  sleep 4
done

echo "✖ Приложение не ответило за две минуты. Последние строки логов:" >&2
docker compose logs --tail 60 app >&2 || true
echo "" >&2
echo "Откатиться вручную: cd $DEPLOY_PATH && git reset --hard $PREVIOUS_SHA && docker compose up -d --build" >&2
echo "Учтите: миграции откатом не отменяются — сначала посмотрите, что именно упало." >&2
exit 1

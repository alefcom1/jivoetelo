#!/usr/bin/env bash
# Ставит конфигурацию nginx, подставляя порт приложения из .env.
#
#     sudo ./deploy/install-nginx.sh
#
# ## Почему это скрипт, а не «скопируйте два файла»
#
# Копирование руками однажды положило сайт. В репозитории лежал порт 3000, на
# сервере приложение слушает 3100 (3000 занят соседним techperevod). Файл
# скопировали поверх живого — и nginx стал проксировать весь jivoetelo.ru на
# приложение соседа. Самое неприятное: ни одна проверка не сработала.
# `nginx -t` доволен, `curl` отдаёт двухсотку — просто чужую страницу.
#
# Порт теперь берётся из того же .env, что и у контейнера, поэтому разойтись
# им негде. Сам файл в репозитории хранит заполнитель: скопированный как
# есть, он не пройдёт `nginx -t`, и ошибка будет видна сразу.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIPPETS="${NGINX_SNIPPETS:-/etc/nginx/snippets}"
SITES="${NGINX_SITES:-/etc/nginx/sites-available}"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Нет $ROOT/.env — из него берётся порт приложения." >&2
  exit 1
fi

PORT="$(sed -n 's/^APP_HOST_PORT=//p' "$ROOT/.env" | tail -n1 | tr -d "\"' \r")"
PORT="${PORT:-3000}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "APP_HOST_PORT в .env не похож на порт: «$PORT»" >&2
  exit 1
fi

# Порт занят кем-то, кроме нашего контейнера, — верный признак того, что
# сейчас мы направим трафик на чужое приложение.
if command -v ss >/dev/null && ! ss -tlnp 2>/dev/null | grep -q ":$PORT .*docker"; then
  echo "Внимание: на порту $PORT не видно docker-контейнера." >&2
  echo "Проверьте, что приложение поднято: docker compose ps" >&2
fi

mkdir -p "$SNIPPETS"
install -m 644 "$ROOT/deploy/nginx/jivoetelo-headers.conf" "$SNIPPETS/"
sed "s|__APP_HOST_PORT__|$PORT|" "$ROOT/deploy/nginx/jivoetelo-proxy.conf" > "$SNIPPETS/jivoetelo-proxy.conf"
chmod 644 "$SNIPPETS/jivoetelo-proxy.conf"
install -m 644 "$ROOT/deploy/nginx/jivoetelo.conf" "$SITES/jivoetelo.ru"

echo "Порт приложения: $PORT"
grep proxy_pass "$SNIPPETS/jivoetelo-proxy.conf"

nginx -t
systemctl reload nginx
echo "nginx перечитал конфигурацию."

#!/usr/bin/env bash
# Восстановление из бэкапа. Проверяйте эту процедуру заранее: бэкап, который
# ни разу не разворачивали, бэкапом не является.
#
#   ./deploy/restore.sh /root/backups/jivoetelo/db-2026-07-28-0330.sql.gz \
#                       /root/backups/jivoetelo/uploads-2026-07-28-0330.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."

db_dump="${1:-}"
uploads_archive="${2:-}"
DB_USER="${POSTGRES_USER:-jivoetelo}"
DB_NAME="${POSTGRES_DB:-jivoetelo}"

if [ -z "$db_dump" ]; then
  echo "Использование: $0 <db-*.sql.gz> [uploads-*.tar.gz]" >&2
  exit 1
fi

echo "Восстановление ПЕРЕЗАПИШЕТ текущие данные в базе $DB_NAME."
read -r -p "Введите ВОССТАНОВИТЬ для подтверждения: " confirm
[ "$confirm" = "ВОССТАНОВИТЬ" ] || { echo "Отменено."; exit 1; }

# Приложение останавливаем: иначе оно продолжит писать в базу во время
# восстановления и получится смесь старых и новых данных.
docker compose stop app

docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB_NAME}_old;" \
  -c "ALTER DATABASE $DB_NAME RENAME TO ${DB_NAME}_old;" \
  -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

gunzip -c "$db_dump" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"

if [ -n "$uploads_archive" ]; then
  docker compose start app
  docker compose exec -T app sh -c 'rm -rf /app/data/uploads && mkdir -p /app/data'
  docker compose exec -T app tar -xzf - -C /app/data < "$uploads_archive"
else
  docker compose start app
fi

echo "Готово. Прежняя база сохранена как ${DB_NAME}_old — удалите её, когда"
echo "убедитесь, что всё на месте: DROP DATABASE ${DB_NAME}_old;"

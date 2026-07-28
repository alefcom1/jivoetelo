#!/usr/bin/env bash
# Ежедневный бэкап: дамп базы + фотографии еды.
#
# Фото лежат в томе Docker, а не в базе, поэтому дампа мало: без снимка
# uploads восстановленный дневник будет ссылаться на несуществующие файлы.
#
# Крон (root), 03:30 каждый день:
#   30 3 * * * /root/jivoetelo/deploy/backup.sh >> /var/log/jivoetelo-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/root/backups/jivoetelo}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_USER="${POSTGRES_USER:-jivoetelo}"
DB_NAME="${POSTGRES_DB:-jivoetelo}"
stamp="$(date +%F-%H%M)"

mkdir -p "$BACKUP_DIR"

# Дамп пишем во временный файл и переименовываем только после успеха:
# оборванный на середине бэкап не должен выглядеть как готовый.
db_tmp="$BACKUP_DIR/.db-$stamp.sql.gz.part"
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip -9 > "$db_tmp"
mv "$db_tmp" "$BACKUP_DIR/db-$stamp.sql.gz"

uploads_tmp="$BACKUP_DIR/.uploads-$stamp.tar.gz.part"
docker compose exec -T app tar -czf - -C /app/data uploads > "$uploads_tmp"
mv "$uploads_tmp" "$BACKUP_DIR/uploads-$stamp.tar.gz"

# Старые копии подчищаем, недоделанные (.part) — тоже.
find "$BACKUP_DIR" -name '*.part' -mtime +1 -delete
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) бэкап готов: db-$stamp.sql.gz, uploads-$stamp.tar.gz"

# ВАЖНО: копия на том же диске, что и продакшен, спасает только от ошибки
# оператора, но не от потери VPS. Отправьте $BACKUP_DIR во внешнее хранилище
# (rclone/rsync на другой сервер) — иначе бэкапа фактически нет.

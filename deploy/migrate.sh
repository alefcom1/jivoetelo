#!/usr/bin/env bash
# Применяет миграции из drizzle/*.sql к базе в контейнере db.
#
# Зачем свой раннер: drizzle-kit — devDependency, в продакшен-образе его нет,
# а «прогнать все файлы через psql» ломается на втором деплое (CREATE TABLE
# по уже созданной таблице). Здесь ведётся таблица schema_migrations, каждая
# миграция применяется один раз и целиком в транзакции: если файл упал,
# база остаётся в состоянии «до».
#
# Запуск из корня репозитория:  ./deploy/migrate.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DB_USER="${POSTGRES_USER:-jivoetelo}"
DB_NAME="${POSTGRES_DB:-jivoetelo}"
PSQL=(docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -q)

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

applied="$("${PSQL[@]}" -At -c "SELECT name FROM schema_migrations;")"

pending=0
for file in drizzle/*.sql; do
  name="$(basename "$file")"
  if printf '%s\n' "$applied" | grep -Fxq "$name"; then
    continue
  fi

  # Хвост файла обязан быть завершённым выражением: иначе наш INSERT
  # приклеится к последнему запросу миграции и всё сломается молча.
  if [ "$(tr -d '[:space:]' < "$file" | tail -c 1)" != ";" ]; then
    echo "Миграция $name не заканчивается точкой с запятой — не применяю." >&2
    exit 1
  fi

  echo "→ применяю $name"
  {
    echo "BEGIN;"
    cat "$file"
    echo
    printf "INSERT INTO schema_migrations (name) VALUES ('%s');\n" "$name"
    echo "COMMIT;"
  } | "${PSQL[@]}"
  pending=$((pending + 1))
done

if [ "$pending" -eq 0 ]; then
  echo "Новых миграций нет."
else
  echo "Применено миграций: $pending."
fi

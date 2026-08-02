#!/usr/bin/env node
/**
 * Проставляет `meal_items.dish_key` записям, сделанным до миграции 0015.
 *
 * Запуск из корня репозитория, после `./deploy/migrate.sh`:
 *
 *     node scripts/backfill-dish-keys.mjs            # посмотреть, что будет
 *     node scripts/backfill-dish-keys.mjs --apply    # записать
 *
 * Почему отдельным скриптом, а не UPDATE внутри миграции: ключ считает
 * TypeScript-модуль (lib/dish-key.ts) со словарём на полторы сотни блюд —
 * повторять этот словарь на SQL значило бы завести вторую его копию, которая
 * разойдётся с первой на первой же правке.
 *
 * Скрипт идемпотентен: трогает только строки с NULL. Пустой ключ означает
 * «ещё не разбирали», а `cat:other` — «разобрали и не узнали»; повторный
 * прогон не переписывает второе первым.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { dishKey } from "../lib/dish-key.ts";

const BATCH = 500;
const apply = process.argv.includes("--apply");

const root = resolve(import.meta.dirname, "..");
const databaseUrl = process.env.DATABASE_URL ?? readEnvValue("DATABASE_URL");
if (!databaseUrl) {
  console.error("DATABASE_URL не задан — ни в окружении, ни в .env.");
  process.exit(1);
}

function readEnvValue(key) {
  try {
    for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match && match[1] === key) return match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env может не быть — в docker compose переменные приходят окружением
  }
  return null;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const { rows: pending } = await client.query(
    "SELECT count(*)::int AS n FROM meal_items WHERE dish_key IS NULL",
  );
  const total = pending[0].n;
  console.log(`Позиций без ключа: ${total}.`);
  if (total === 0) process.exit(0);

  let done = 0;
  const byKey = new Map();

  for (;;) {
    const { rows } = await client.query(
      "SELECT id, name FROM meal_items WHERE dish_key IS NULL ORDER BY id LIMIT $1",
      [BATCH],
    );
    if (rows.length === 0) break;

    const ids = [];
    const keys = [];
    for (const row of rows) {
      const key = dishKey(row.name).key;
      ids.push(row.id);
      keys.push(key);
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }

    if (apply) {
      // unnest вместо строки на запрос: пятьсот UPDATE'ов по одному дают
      // пятьсот сетевых обходов там, где хватает одного.
      await client.query(
        `UPDATE meal_items AS mi SET dish_key = source.key
           FROM (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS key) AS source
          WHERE mi.id = source.id`,
        [ids, keys],
      );
    }

    done += rows.length;
    console.log(`  ${done} / ${total}`);
    // Без --apply строки остаются с NULL, и выборка вернула бы те же самые:
    // одного прохода достаточно, чтобы показать раскладку.
    if (!apply) break;
  }

  const top = [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`\nСамые частые ключи${apply ? "" : " (по первой партии)"}:`);
  for (const [key, count] of top) console.log(`  ${String(count).padStart(5)}  ${key}`);

  const unresolved = [...byKey.entries()]
    .filter(([key]) => key.startsWith("cat:"))
    .reduce((sum, [, count]) => sum + count, 0);
  const seen = [...byKey.values()].reduce((sum, count) => sum + count, 0);
  console.log(`\nДо уровня блюда дошло: ${seen - unresolved} из ${seen} (${Math.round(((seen - unresolved) / seen) * 100)}%).`);

  if (!apply) console.log("\nЭто был просмотр. Чтобы записать — повторите с --apply.");
} finally {
  await client.end();
}

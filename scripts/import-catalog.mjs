#!/usr/bin/env node
/**
 * Импорт внешнего каталога продуктов в таблицу `food_catalog`.
 *
 * Разрешения на источники получены у правообладателей; условия и границы —
 * в docs/content-programme.md и docs/catalog-import.md. По таблицам ФИЦ
 * питания обязательна атрибуция первоисточника в интерфейсе — она сделана
 * структурно, через lib/catalog-sources.ts.
 *
 * ## Как пользоваться
 *
 * По умолчанию — **сухой прогон**: скрипт разбирает файл, печатает отчёт и
 * ничего не пишет. Это не перестраховка: у чужих таблиц качество заранее
 * неизвестно, и отчёт по ста тысячам строк — единственный способ понять,
 * что вы собираетесь залить, до того как зальёте.
 *
 *   node scripts/import-catalog.mjs --source health-diet --file products.csv
 *   node scripts/import-catalog.mjs --source health-diet --file products.csv --write
 *
 * Поддерживаются CSV (запятая или точка с запятой) и JSON-массив объектов.
 *
 * Колонки распознаются по заголовку автоматически: русские и английские
 * названия из тех, что встречаются у источников. Если угадать не удалось,
 * скрипт скажет, какие заголовки увидел, и предложит задать их руками:
 *
 *   --col-name Продукт --col-kcal Ккал --col-protein Белки ...
 *
 * ## Чего скрипт не делает
 *
 * Не сливает импорт с выверенным справочником `lib/food-reference.ts`.
 * Совпадения считаются и показываются, но решение — за человеком: «гречка»
 * в чужой таблице сухая, у нас отварная, и молчаливое слияние дало бы
 * трёхкратную ошибку.
 */

import { readFileSync } from "node:fs";
import { FOOD_REFERENCE } from "../lib/food-reference.ts";
import { formatReport, normalizeSearchKey, parseAll } from "../lib/catalog-import.ts";
import { CATALOG_SOURCES, isCatalogSource } from "../lib/catalog-sources.ts";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

/**
 * Минимальный разбор CSV: кавычки, удвоенные кавычки внутри поля, перевод
 * строки внутри поля. Отдельная зависимость ради одного скрипта не нужна,
 * а наивный split(",") ломается на первом же «Творог, 5%».
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  const delimiter = pickDelimiter(text);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(field); field = ""; continue; }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Разделитель угадывается по первой строке: у русских выгрузок часто «;». */
function pickDelimiter(text) {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

function readRows(file) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("JSON должен быть массивом объектов");
    return parsed;
  }
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("В файле нет строк данных");
  const header = table[0].map((h) => h.trim());
  return table.slice(1)
    // Пустые строки в хвосте файла — норма, а не ошибка.
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => Object.fromEntries(header.map((name, at) => [name, cells[at] ?? ""])));
}

/** Синонимы заголовков у источников — русские и английские. */
const COLUMN_HINTS = {
  name: ["название", "наименование", "продукт", "блюдо", "name", "title", "food"],
  kcal: ["ккал", "калорийность", "калории", "энергетическая", "kcal", "calories", "energy"],
  protein: ["белки", "белок", "protein", "proteins"],
  fat: ["жиры", "жир", "fat", "fats"],
  carbs: ["углеводы", "углевод", "carbs", "carbohydrates"],
  fiber: ["клетчатка", "пищевые волокна", "волокна", "fiber", "fibre"],
  portion: ["порция", "вес порции", "portion", "serving"],
  ref: ["id", "код", "артикул", "ref", "slug"],
};

function guessColumns(header, args) {
  const columns = {};
  const lower = header.map((h) => ({ raw: h, low: h.toLowerCase().trim() }));

  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    const manual = args[`col-${field}`];
    if (typeof manual === "string") { columns[field] = manual; continue; }
    // Точное совпадение важнее вхождения: у «белки» и «белки, г» разный
    // приоритет только в пользу читаемости, но «жиры» не должны поймать
    // колонку «жирность».
    const exact = lower.find((h) => hints.includes(h.low));
    const partial = lower.find((h) => hints.some((hint) => h.low.startsWith(hint)));
    const hit = exact ?? partial;
    if (hit) columns[field] = hit.raw;
  }
  return columns;
}

const REQUIRED_COLUMNS = ["name", "kcal", "protein", "fat", "carbs"];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source;
  const file = args.file;

  if (!source || !file) {
    console.error("Нужны --source и --file. Источники: " + Object.keys(CATALOG_SOURCES).join(", "));
    process.exit(1);
  }
  if (!isCatalogSource(source)) {
    console.error(`Неизвестный источник «${source}». Известные: ${Object.keys(CATALOG_SOURCES).join(", ")}`);
    console.error("Новый источник заводится в lib/catalog-sources.ts — вместе с подписью для интерфейса.");
    process.exit(1);
  }

  const rows = readRows(file);
  const header = Object.keys(rows[0] ?? {});
  const columns = guessColumns(header, args);

  const missing = REQUIRED_COLUMNS.filter((field) => !columns[field]);
  if (missing.length > 0) {
    console.error(`Не нашёл колонки: ${missing.join(", ")}`);
    console.error(`Заголовки в файле: ${header.join(" | ")}`);
    console.error("Задайте руками, например: --col-name Продукт --col-kcal Ккал");
    process.exit(1);
  }

  console.log(`Колонки: ${Object.entries(columns).map(([k, v]) => `${k}=${v}`).join(", ")}`);

  const referenceKeys = new Set(FOOD_REFERENCE.map((food) => normalizeSearchKey(food.name)));
  const { rows: parsed, report } = parseAll(rows, columns, source, referenceKeys);

  console.log("");
  console.log(formatReport(report, CATALOG_SOURCES[source].full));
  console.log("");

  if (!args.write) {
    console.log(`Сухой прогон: в базу ничего не записано. Готовы к записи ${parsed.length} строк.`);
    console.log("Повторите с --write, когда отчёт устроит.");
    return;
  }

  if (parsed.length === 0) {
    console.log("Записывать нечего.");
    return;
  }

  // Импорт в базу грузится только на этом шаге: в сухом прогоне подключение
  // к Postgres не нужно, и требовать DATABASE_URL ради отчёта неправильно.
  const { upsertCatalogRows, catalogStats } = await import("../lib/catalog-store.ts");
  const { written } = await upsertCatalogRows(parsed);
  console.log(`Записано строк: ${written}`);

  console.log("");
  console.log("В каталоге сейчас:");
  for (const stat of await catalogStats()) {
    console.log(`  ${stat.source}: ${stat.total} всего, ${stat.verified} годны к поиску`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

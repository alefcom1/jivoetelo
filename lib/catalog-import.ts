/**
 * Импорт внешних каталогов: разбор строки и контроль качества.
 *
 * Чистый модуль — без обращений к базе, чтобы поднимался под голым
 * `node --test`. Работа с базой в lib/catalog-store.ts, командная обёртка в
 * scripts/import-catalog.mjs.
 *
 * ## Что здесь происходит
 *
 * Строка из чужого файла проходит четыре сита:
 *
 * 1. **Разбор.** Числа приходят строками, с запятой вместо точки, иногда с
 *    единицами («12,5 г»). Имя — с лишними пробелами и хвостами вроде
 *    «(на 100 г)», которые в нашем интерфейсе только мешают.
 * 2. **Правдоподобие.** Отрицательных белков не бывает, суммы БЖУ больше
 *    100 г на 100 г продукта — тоже.
 * 3. **Атуотер.** Сходится ли калорийность с составом. Ловит опечатку в
 *    разряде — самую вероятную ошибку в таблице чисел.
 * 4. **Дубли.** Совпадение с выверенным справочником помечается, но не
 *    отбрасывается молча: решение — за человеком.
 *
 * Строка, не прошедшая сито 2, отбрасывается: чинить нечего. Не прошедшая
 * сито 3 сохраняется с `verified: false` — она не попадёт в поиск, но
 * останется видна в отчёте, и объём проблемы будет измерим.
 */

import { atwaterKcal } from "./nutrition-sanity.ts";
import type { CatalogSourceKey } from "./catalog-sources.ts";

/** Сырая строка внешнего файла: всё строками, потому что CSV. */
export type RawRow = Record<string, string | number | null | undefined>;

export type CatalogRow = {
  name: string;
  searchKey: string;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  portionG: number;
  source: CatalogSourceKey;
  sourceRef: string | null;
  verified: boolean;
};

export type RejectReason =
  | "no-name"
  | "no-kcal"
  | "negative"
  | "impossible-mass"
  | "duplicate-in-file";

export type ParseOutcome =
  | { ok: true; row: CatalogRow; atwaterOff: boolean }
  | { ok: false; reason: RejectReason; name: string };

/**
 * Числа из чужих файлов: «12,5», «12.5 г», «1 234», пустая строка.
 * Возвращает null, когда числа нет вовсе, — это отличается от нуля.
 */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\s+/g, "")
    .replace(",", ".")
    // Единицы и всё, что не число: «12.5г», «12.5 kcal».
    .replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Имя позиции: убираем лишние пробелы и хвосты про сто грамм — у нас на
 * сто грамм считается всё, и повторять это в каждом названии незачем.
 */
export function cleanName(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .replace(/\s+/g, " ")
    .replace(/\s*\((?:на\s*)?100\s*(?:г|гр|грамм)\.?\)\s*$/i, "")
    .replace(/\s*,\s*$/, "")
    .trim();
}

/**
 * Ключ поиска. Ё приводится к Е намеренно: половина таблиц пишет «гречневая»,
 * другая «гречнёвая», и человек ищет как придётся.
 */
export function normalizeSearchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

/** Насколько калорийность может расходиться с расчётом по Атуотеру. */
export const ATWATER_TOLERANCE = 0.25;

/**
 * Сходится ли заявленная калорийность с составом.
 *
 * Порог широкий с обеих сторон и такой же, как у теста выверенного
 * справочника: таблицы дают калорийность по факту измерения, а не по
 * формуле, и расхождение в четверть — норма, а не повод править число.
 *
 * Почти нулевые по калорийности (чай, специи, вода) через отношение не
 * проверяются: там и числитель, и знаменатель — шум.
 */
export function atwaterAgrees(row: {
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
}): boolean {
  if (row.kcalPer100 < 15) return true;
  const computed = atwaterKcal({
    protein: row.proteinPer100,
    fat: row.fatPer100,
    carbs: row.carbsPer100,
    fiber: row.fiberPer100,
    alcohol: 0,
  });
  const ratio = computed / row.kcalPer100;
  return ratio > 1 - ATWATER_TOLERANCE && ratio < 1 + ATWATER_TOLERANCE;
}

/**
 * Синонимы заголовков у источников — русские и английские.
 *
 * Живут здесь, а не в скрипте импорта, потому что ими пользуются двое:
 * импортёр разбирает по ним заголовок CSV, сборщик (scripts/collect-catalog.mjs)
 * по ним же опознаёт нужную таблицу на странице. Две копии этого списка
 * разошлись бы, и разошлись бы молча.
 */
export const COLUMN_HINTS: Record<string, string[]> = {
  name: ["название", "наименование", "продукт", "блюдо", "name", "title", "food"],
  kcal: ["ккал", "калорийность", "калории", "энергетическая", "kcal", "calories", "energy"],
  protein: ["белки", "белок", "protein", "proteins"],
  fat: ["жиры", "жир", "fat", "fats"],
  carbs: ["углеводы", "углевод", "carbs", "carbohydrates"],
  fiber: ["клетчатка", "пищевые волокна", "волокна", "fiber", "fibre"],
  portion: ["порция", "вес порции", "portion", "serving"],
  ref: ["id", "код", "артикул", "ref", "slug"],
};

/** Без этих колонок строка бесполезна: дневник считает по ним. */
export const REQUIRED_COLUMNS = ["name", "kcal", "protein", "fat", "carbs"];

/**
 * Сопоставляет заголовки файла или таблицы с нашими полями.
 *
 * Точное совпадение важнее вхождения: «жиры» не должны поймать колонку
 * «жирность», а «белки» — «белки, г» и «белки» одинаково хороши.
 */
export function guessColumns(header: string[], manual: Record<string, string> = {}): Partial<ColumnMap> {
  const columns: Record<string, string> = {};
  const lower = header.map((h) => ({ raw: h, low: h.toLowerCase().trim() }));

  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    if (manual[field]) { columns[field] = manual[field]; continue; }
    const exact = lower.find((h) => hints.includes(h.low));
    const partial = lower.find((h) => hints.some((hint) => h.low.startsWith(hint)));
    const hit = exact ?? partial;
    if (hit) columns[field] = hit.raw;
  }
  return columns as Partial<ColumnMap>;
}

/** Каких обязательных колонок не хватает. */
export function missingColumns(columns: Partial<ColumnMap>): string[] {
  return REQUIRED_COLUMNS.filter((field) => !columns[field as keyof ColumnMap]);
}

/** Как названы колонки в файле источника. */
export type ColumnMap = {
  name: string;
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  fiber?: string;
  portion?: string;
  ref?: string;
};

/**
 * Разбирает одну строку файла.
 *
 * `atwaterOff` возвращается отдельно от `verified`, чтобы вызывающий мог
 * посчитать, сколько строк источника не сходится: это оценка качества
 * источника целиком, а не свойство отдельной позиции.
 */
export function parseRow(raw: RawRow, columns: ColumnMap, source: CatalogSourceKey): ParseOutcome {
  const name = cleanName(raw[columns.name]);
  if (name.length === 0) return { ok: false, reason: "no-name", name: "" };

  const kcal = parseNumber(raw[columns.kcal]);
  // Без калорийности позиция бесполезна: дневник считает по ней.
  if (kcal === null) return { ok: false, reason: "no-kcal", name };

  const protein = parseNumber(raw[columns.protein]) ?? 0;
  const fat = parseNumber(raw[columns.fat]) ?? 0;
  const carbs = parseNumber(raw[columns.carbs]) ?? 0;
  const fiber = columns.fiber ? parseNumber(raw[columns.fiber]) ?? 0 : 0;
  const portion = columns.portion ? parseNumber(raw[columns.portion]) ?? 0 : 0;

  if (kcal < 0 || protein < 0 || fat < 0 || carbs < 0 || fiber < 0) {
    return { ok: false, reason: "negative", name };
  }
  // В ста граммах продукта не может быть больше ста граммов вещества.
  // Небольшой запас на округления в источнике: 102, а не 100.
  if (protein + fat + carbs > 102) {
    return { ok: false, reason: "impossible-mass", name };
  }
  // Клетчатка — часть углеводов, а не добавка к ним. Источники путают это
  // регулярно; правим молча, потому что иначе Атуотер объявит строку кривой.
  const safeFiber = Math.min(fiber, carbs);

  const row: CatalogRow = {
    name,
    searchKey: normalizeSearchKey(name),
    kcalPer100: round1(kcal),
    proteinPer100: round1(protein),
    fatPer100: round1(fat),
    carbsPer100: round1(carbs),
    fiberPer100: round1(safeFiber),
    portionG: portion > 0 ? Math.round(portion) : 0,
    source,
    sourceRef: columns.ref ? String(raw[columns.ref] ?? "").trim() || null : null,
    verified: false,
  };
  const agrees = atwaterAgrees(row);
  row.verified = agrees;
  return { ok: true, row, atwaterOff: !agrees };
}

/** Одна десятая — предел осмысленной точности для состава на 100 г. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type ImportReport = {
  total: number;
  accepted: number;
  atwaterOff: number;
  duplicatesInFile: number;
  duplicatesWithReference: number;
  rejected: Record<RejectReason, number>;
  samples: { atwaterOff: string[]; rejected: string[] };
};

export function emptyReport(): ImportReport {
  return {
    total: 0,
    accepted: 0,
    atwaterOff: 0,
    duplicatesInFile: 0,
    duplicatesWithReference: 0,
    rejected: {
      "no-name": 0,
      "no-kcal": 0,
      negative: 0,
      "impossible-mass": 0,
      "duplicate-in-file": 0,
    },
    samples: { atwaterOff: [], rejected: [] },
  };
}

/** Сколько примеров каждой проблемы показывать в отчёте. */
const SAMPLE_LIMIT = 10;

/**
 * Разбирает весь файл.
 *
 * `referenceKeys` — ключи выверенного справочника. Совпадения считаются, но
 * строки не выбрасываются: «гречка» в чужой таблице сухая, у нас отварная, и
 * молча слить их значило бы получить трёхкратную ошибку. Решение — за
 * человеком, отчёт лишь показывает объём.
 */
export function parseAll(
  rows: RawRow[],
  columns: ColumnMap,
  source: CatalogSourceKey,
  referenceKeys: ReadonlySet<string> = new Set(),
): { rows: CatalogRow[]; report: ImportReport } {
  const report = emptyReport();
  const out: CatalogRow[] = [];
  const seen = new Set<string>();

  for (const raw of rows) {
    report.total += 1;
    const outcome = parseRow(raw, columns, source);
    if (!outcome.ok) {
      report.rejected[outcome.reason] += 1;
      if (report.samples.rejected.length < SAMPLE_LIMIT) {
        report.samples.rejected.push(`${outcome.reason}: ${outcome.name || "(без имени)"}`);
      }
      continue;
    }

    // Дубль внутри одного файла: у источников это бывает, и без отсева
    // уникальный индекс уронил бы весь прогон на середине.
    const dupeKey = outcome.row.sourceRef ?? outcome.row.searchKey;
    if (seen.has(dupeKey)) {
      report.duplicatesInFile += 1;
      report.rejected["duplicate-in-file"] += 1;
      continue;
    }
    seen.add(dupeKey);

    if (referenceKeys.has(outcome.row.searchKey)) report.duplicatesWithReference += 1;
    if (outcome.atwaterOff) {
      report.atwaterOff += 1;
      if (report.samples.atwaterOff.length < SAMPLE_LIMIT) {
        const { name, kcalPer100, proteinPer100, fatPer100, carbsPer100 } = outcome.row;
        report.samples.atwaterOff.push(
          `${name}: заявлено ${kcalPer100} ккал, по БЖУ ${Math.round(
            atwaterKcal({ protein: proteinPer100, fat: fatPer100, carbs: carbsPer100, fiber: outcome.row.fiberPer100, alcohol: 0 }),
          )} (Б${proteinPer100} Ж${fatPer100} У${carbsPer100})`,
        );
      }
    }

    report.accepted += 1;
    out.push(outcome.row);
  }

  return { rows: out, report };
}

/** Отчёт в человеческий текст — его печатает импортёр и читает человек. */
export function formatReport(report: ImportReport, source: string): string {
  const lines = [
    `Источник: ${source}`,
    `Строк в файле:        ${report.total}`,
    `Принято:              ${report.accepted}`,
    `  из них без Атуотера: ${report.atwaterOff} (в поиск не попадут)`,
    `Отброшено:            ${report.total - report.accepted}`,
  ];
  for (const [reason, count] of Object.entries(report.rejected)) {
    if (count > 0) lines.push(`  ${reason}: ${count}`);
  }
  lines.push(`Совпадает с выверенным справочником: ${report.duplicatesWithReference} (разбирать глазами)`);
  if (report.samples.atwaterOff.length > 0) {
    lines.push("", "Примеры расхождений по Атуотеру:");
    for (const sample of report.samples.atwaterOff) lines.push(`  ${sample}`);
  }
  if (report.samples.rejected.length > 0) {
    lines.push("", "Примеры отброшенных:");
    for (const sample of report.samples.rejected) lines.push(`  ${sample}`);
  }
  return lines.join("\n");
}

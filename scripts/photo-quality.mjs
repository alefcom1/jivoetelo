#!/usr/bin/env node
/**
 * Что на самом деле портит разбор снимка.
 *
 *     node scripts/photo-quality.mjs [--limit 500] [--csv отчёт.csv]
 *
 * Запускать там, где лежат настоящие снимки, — то есть на сервере:
 *
 *     docker compose exec app node scripts/photo-quality.mjs
 *
 * ## Зачем
 *
 * Пороги в lib/frame-quality.ts подобраны на глаз. Это честно сказано в самом
 * файле, но жить так долго нельзя: от них зависит, сработает ли автоспуск и
 * не начнёт ли он снимать мутные кадры. Проверить их можно только по своим
 * данным — и они у нас есть, причём размечать ничего не надо.
 *
 * У каждой позиции разбора модель проставила уверенность (high / medium /
 * low). Это и есть готовая разметка: снимок, по которому модель ответила
 * уверенно, — хороший снимок. Осталось посчитать по тем же файлам те же
 * метрики и посмотреть, расходятся ли они между уверенными и неуверенными
 * разборами. Если расходятся — пороги ставятся по числам, а не по ощущению.
 * Если нет — значит дело не в качестве кадра, и городить детектор незачем.
 *
 * ## Почему метрики берутся из lib/frame-quality.ts, а не считаются здесь
 *
 * Иначе замер ничего не доказывает: подобранный по одной формуле порог
 * применялся бы к числу, посчитанному другой. Здесь только чтение файла и
 * приведение к тому же размеру, что и у живого кадра.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { getDb } from "../db/index.ts";
import { mealItems, meals } from "../db/schema.ts";
import { and, isNotNull, eq } from "drizzle-orm";
import {
  frameStats,
  toGrayscale,
  MAX_CLIPPED,
  MIN_LUMA,
  MAX_LUMA,
  MIN_SHARPNESS,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
} from "../lib/frame-quality.ts";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const LIMIT = Number(flag("--limit", "1000"));
const CSV = flag("--csv", null);
const UPLOADS = process.env.UPLOADS_DIR ?? path.resolve("data/uploads");

/** Уверенность всего разбора — по худшей позиции, как и на экранах. */
const RANK = { low: 0, medium: 1, high: 2 };
function worst(values) {
  return values.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), "high");
}

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function describe(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

const db = getDb();
const rows = await db
  .select({ id: meals.id, photoKey: meals.photoKey })
  .from(meals)
  .where(and(isNotNull(meals.photoKey)))
  .limit(LIMIT);

if (rows.length === 0) {
  console.log("Снимков с фотографиями в базе нет — мерить нечего.");
  console.log(`Проверьте UPLOADS_DIR (сейчас ${UPLOADS}) и что запуск идёт против нужной базы.`);
  process.exit(0);
}

console.log(`Снимков в выборке: ${rows.length}. Файлы ищем в ${UPLOADS}\n`);

const measured = [];
let missing = 0;
let unreadable = 0;

for (const row of rows) {
  const items = await db
    .select({ confidence: mealItems.confidence })
    .from(mealItems)
    .where(eq(mealItems.mealId, row.id));
  if (items.length === 0) continue;

  let raw;
  try {
    raw = await readFile(path.join(UPLOADS, row.photoKey));
  } catch {
    missing++;
    continue;
  }

  try {
    // Тот же размер, что у живого кадра: уменьшение само по себе размывает
    // картинку, и резкость, посчитанная в другом масштабе, несравнима.
    const { data } = await sharp(raw)
      .resize(SAMPLE_WIDTH, SAMPLE_HEIGHT, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const stats = frameStats(toGrayscale(data), SAMPLE_WIDTH, SAMPLE_HEIGHT);
    measured.push({ id: row.id, confidence: worst(items.map((i) => i.confidence)), ...stats });
  } catch {
    unreadable++;
  }
}

if (missing || unreadable) {
  console.log(`Пропущено: файл не найден — ${missing}, не читается как картинка — ${unreadable}\n`);
}
if (measured.length === 0) {
  console.log("Ни одного снимка прочитать не удалось. Дальше считать нечего.");
  process.exit(1);
}

const groups = {
  "уверенный разбор (high)": measured.filter((m) => m.confidence === "high"),
  "средний (medium)": measured.filter((m) => m.confidence === "medium"),
  "неуверенный (low)": measured.filter((m) => m.confidence === "low"),
};

const METRICS = [
  ["резкость", "sharpness"],
  ["яркость", "luma"],
  ["выбито", "clipped"],
];

console.log("Разбор снимков по уверенности. Столбцы: 10-й процентиль / медиана / 90-й.\n");
for (const [label, group] of Object.entries(groups)) {
  if (group.length === 0) { console.log(`${label}: нет примеров`); continue; }
  console.log(`${label} — ${group.length} шт.`);
  for (const [name, key] of METRICS) {
    const d = describe(group.map((m) => m[key]));
    const round = key === "clipped" ? (v) => v.toFixed(3) : (v) => v.toFixed(0);
    console.log(`  ${name.padEnd(9)} ${round(d.p10).padStart(7)} ${round(d.median).padStart(7)} ${round(d.p90).padStart(7)}`);
  }
  console.log("");
}

/**
 * Главный вывод: расходится ли метрика между уверенными и неуверенными
 * разборами. Если медианы близки — метрика ни при чём, и порог по ней
 * бесполезен, каким его ни ставь.
 */
const high = groups["уверенный разбор (high)"];
const low = groups["неуверенный (low)"];
if (high.length >= 10 && low.length >= 10) {
  console.log("Расхождение медиан (уверенные против неуверенных):");
  for (const [name, key] of METRICS) {
    const a = quantile(high.map((m) => m[key]).sort((x, y) => x - y), 0.5);
    const b = quantile(low.map((m) => m[key]).sort((x, y) => x - y), 0.5);
    const ratio = b === 0 ? Infinity : a / b;
    const verdict = Math.abs(ratio - 1) < 0.15 ? "разницы нет" : "есть разница";
    console.log(`  ${name.padEnd(9)} ${a.toFixed(2)} против ${b.toFixed(2)} — ${verdict}`);
  }
  console.log("");
} else {
  console.log(`Для сравнения групп мало данных: уверенных ${high.length}, неуверенных ${low.length}.`);
  console.log("Нужно хотя бы по десять в каждой — иначе разница будет случайной.\n");
}

// Сколько снимков нынешние пороги забраковали бы. Число само по себе ничего
// не решает, но показывает цену: если отсеивается половина уверенных
// разборов, пороги строже, чем нужно.
const wouldReject = (m) =>
  m.sharpness < MIN_SHARPNESS || m.luma < MIN_LUMA || m.luma > MAX_LUMA || m.clipped > MAX_CLIPPED;
console.log("Нынешние пороги lib/frame-quality.ts забраковали бы:");
for (const [label, group] of Object.entries(groups)) {
  if (group.length === 0) continue;
  const rejected = group.filter(wouldReject).length;
  console.log(`  ${label}: ${rejected} из ${group.length} (${Math.round((rejected / group.length) * 100)}%)`);
}

if (CSV) {
  const lines = ["meal_id,confidence,sharpness,luma,clipped"];
  for (const m of measured) {
    lines.push(`${m.id},${m.confidence},${m.sharpness.toFixed(2)},${m.luma.toFixed(2)},${m.clipped.toFixed(4)}`);
  }
  writeFileSync(CSV, lines.join("\n"));
  console.log(`\nСырые числа: ${CSV}`);
}

process.exit(0);

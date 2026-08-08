/**
 * Каталог продуктов: работа с базой.
 *
 * Разбор и контроль качества — в lib/catalog-import.ts (чистый модуль),
 * здесь только запись и чтение. То же разделение, что у пары
 * lib/catalog-photos.ts и lib/catalog-photos-store.ts.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { foodCatalog } from "@/db/schema";
import type { CatalogRow } from "./catalog-import.ts";
import { normalizeSearchKey } from "./catalog-import.ts";
import { sourceRank } from "./catalog-sources.ts";

/**
 * Сколько строк отправляем одним запросом.
 *
 * Не «весь файл разом»: у Postgres предел параметров в одном запросе
 * (65535), а у нас 12 колонок на строку — то есть около пяти тысяч строк
 * упёрлись бы в него. Тысяча даёт запас и не держит транзакцию долго.
 */
export const INSERT_CHUNK = 1000;

/**
 * Записать разобранные строки.
 *
 * Идемпотентно по паре «источник + идентификатор в источнике»: повторный
 * прогон обновляет строку, а не заводит вторую. Это важнее, чем кажется:
 * импорт на сто тысяч позиций редко удаётся с первого раза, и второй заход
 * должен быть безопасным.
 *
 * `corrections` при обновлении **не трогаем** — это счётчик человеческих
 * правок, и импорт не имеет права его обнулять. По той же причине не
 * обновляем строки, которые люди уже правили: свежий импорт из чужой
 * таблицы не должен затирать уточнение по упаковке.
 */
export async function upsertCatalogRows(rows: CatalogRow[]): Promise<{ written: number }> {
  if (rows.length === 0) return { written: 0 };
  const db = getDb();
  let written = 0;

  for (let at = 0; at < rows.length; at += INSERT_CHUNK) {
    const chunk = rows.slice(at, at + INSERT_CHUNK);
    await db
      .insert(foodCatalog)
      .values(chunk)
      .onConflictDoUpdate({
        target: [foodCatalog.source, foodCatalog.sourceRef],
        set: {
          name: sql`excluded.name`,
          searchKey: sql`excluded.search_key`,
          kcalPer100: sql`excluded.kcal_per_100`,
          proteinPer100: sql`excluded.protein_per_100`,
          fatPer100: sql`excluded.fat_per_100`,
          carbsPer100: sql`excluded.carbs_per_100`,
          fiberPer100: sql`excluded.fiber_per_100`,
          portionG: sql`excluded.portion_g`,
          verified: sql`excluded.verified`,
          updatedAt: sql`now()`,
        },
        // Позицию, которую правили люди, импорт не трогает.
        setWhere: sql`${foodCatalog.corrections} = 0`,
      });
    written += chunk.length;
  }

  return { written };
}

export type CatalogHit = {
  id: number;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  portionG: number;
  source: string;
};

/**
 * Поиск по длинному хвосту.
 *
 * Только `verified`: строка, у которой калорийность не сходится с составом,
 * в дневник попасть не должна. Она остаётся в базе и видна в отчётах — но
 * человеку мы её не предлагаем.
 *
 * Сортировка: сначала точное совпадение ключа, затем начало строки, затем
 * вхождение; внутри одинакового качества — по надёжности источника
 * (lib/catalog-sources.ts) и длине имени. Короткое имя почти всегда
 * основное: «Гречка отварная» полезнее, чем «Гречка отварная с грибами и
 * луком по-деревенски».
 */
export async function searchCatalog(query: string, limit = 20): Promise<CatalogHit[]> {
  const key = normalizeSearchKey(query);
  if (key.length < 2) return [];

  const like = `%${key}%`;
  const rows = await getDb()
    .select({
      id: foodCatalog.id,
      name: foodCatalog.name,
      kcalPer100: foodCatalog.kcalPer100,
      proteinPer100: foodCatalog.proteinPer100,
      fatPer100: foodCatalog.fatPer100,
      carbsPer100: foodCatalog.carbsPer100,
      fiberPer100: foodCatalog.fiberPer100,
      portionG: foodCatalog.portionG,
      source: foodCatalog.source,
      searchKey: foodCatalog.searchKey,
    })
    .from(foodCatalog)
    .where(and(eq(foodCatalog.verified, true), sql`${foodCatalog.searchKey} LIKE ${like}`))
    // Берём с запасом: окончательный порядок считаем в коде, где доступен
    // ранг источника, а тащить его в SQL значило бы описать список источников
    // второй раз.
    .limit(limit * 5);

  return rows
    .map((row) => ({ row, quality: matchQuality(row.searchKey, key) }))
    .sort((a, b) =>
      b.quality - a.quality
      || sourceRank(a.row.source) - sourceRank(b.row.source)
      || a.row.name.length - b.row.name.length)
    .slice(0, limit)
    // searchKey нужен был только для ранжирования — наружу он не идёт.
    .map(({ row }) => ({
      id: row.id,
      name: row.name,
      kcalPer100: row.kcalPer100,
      proteinPer100: row.proteinPer100,
      fatPer100: row.fatPer100,
      carbsPer100: row.carbsPer100,
      fiberPer100: row.fiberPer100,
      portionG: row.portionG,
      source: row.source,
    }));
}

/** 3 — точное совпадение, 2 — начало строки, 1 — вхождение. */
function matchQuality(haystack: string, needle: string): number {
  if (haystack === needle) return 3;
  if (haystack.startsWith(needle)) return 2;
  return 1;
}

/** Сколько позиций в каталоге и сколько из них годны к поиску. */
export async function catalogStats(): Promise<Array<{ source: string; total: number; verified: number }>> {
  return getDb()
    .select({
      source: foodCatalog.source,
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where ${foodCatalog.verified})::int`,
    })
    .from(foodCatalog)
    .groupBy(foodCatalog.source)
    .orderBy(asc(foodCatalog.source));
}

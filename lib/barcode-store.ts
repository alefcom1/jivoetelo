/**
 * Своя база штрихкодов: чтение и пополнение.
 *
 * Единой открытой базы штрихкодов российских продуктов с составом не
 * существует (docs/research-2026-08.md), и покупать доступ к чужой мы не
 * будем. Значит, база наша и растёт от людей: не нашлось — ввёл КБЖУ с
 * упаковки, и следующий получит её сразу.
 *
 * Это не «пользователи поработают за нас». Ввести числа с пачки человек всё
 * равно должен — вопрос только в том, пропадут они после сохранения или
 * останутся. Здесь они остаются.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { barcodes } from "@/db/schema";
import { isStoreInternal, normalizeBarcode, type BarcodeProduct } from "./barcode.ts";
import { clampPer100, isBlankNutrition } from "./nutrition.ts";

export type { BarcodeProduct };

export type SaveResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "invalid_code" | "store_internal" | "no_name" | "blank_nutrition" };

/** Ищет товар по коду. Возвращает null и на неизвестный код, и на мусор. */
export async function findByBarcode(rawCode: string): Promise<BarcodeProduct | null> {
  const code = normalizeBarcode(rawCode);
  if (!code) return null;

  const rows = await getDb()
    .select({
      code: barcodes.code,
      name: barcodes.name,
      kcalPer100: barcodes.kcalPer100,
      proteinPer100: barcodes.proteinPer100,
      fatPer100: barcodes.fatPer100,
      carbsPer100: barcodes.carbsPer100,
      fiberPer100: barcodes.fiberPer100,
      portionG: barcodes.portionG,
      confirmations: barcodes.confirmations,
    })
    .from(barcodes)
    .where(eq(barcodes.code, code))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Заводит товар или обновляет существующий.
 *
 * Существующий обновляется, а не защищается от правки: у карточки нет
 * владельца, и первый заведший её не становится её хозяином. Ошибку в
 * числах должен уметь исправить следующий, кто держит ту же пачку в руках.
 *
 * Счётчик подтверждений при правке сбрасывается: подтверждали прежние числа,
 * а не эти.
 */
export async function saveBarcode(input: {
  code: string;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  portionG?: number;
  userId: number;
}): Promise<SaveResult> {
  const code = normalizeBarcode(input.code);
  if (!code) return { ok: false, reason: "invalid_code" };
  // Внутренний код магазина означает вес и цену конкретной упаковки, а не
  // товар: завтра та же цифра будет означать другое. В общую базу нельзя.
  if (isStoreInternal(code)) return { ok: false, reason: "store_internal" };

  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, reason: "no_name" };

  const nutrition = {
    kcalPer100: clampPer100("kcal", input.kcalPer100),
    proteinPer100: clampPer100("protein", input.proteinPer100),
    fatPer100: clampPer100("fat", input.fatPer100),
    carbsPer100: clampPer100("carbs", input.carbsPer100),
    fiberPer100: clampPer100("fiber", input.fiberPer100),
  };
  // Карточка со всеми нулями бесполезна и хуже отсутствия: следующий
  // отсканировавший получит «нашлось» и запишет в дневник ноль калорий.
  if (isBlankNutrition(nutrition)) return { ok: false, reason: "blank_nutrition" };

  const portionG = Math.min(3000, Math.max(0, Math.round(input.portionG ?? 0)));

  const inserted = await getDb()
    .insert(barcodes)
    .values({ code, name, ...nutrition, portionG, createdBy: input.userId })
    .onConflictDoUpdate({
      target: barcodes.code,
      set: { name, ...nutrition, portionG, confirmations: 0, updatedAt: new Date() },
    })
    // xmax = 0 у только что вставленной строки и не ноль у обновлённой —
    // способ отличить «завёл новый товар» от «поправил чужие числа» одним
    // запросом. Второй запрос «а был ли он там» гонку бы не пережил.
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  return { ok: true, created: inserted[0]?.inserted ?? true };
}

/**
 * Отмечает, что карточкой воспользовались как есть.
 *
 * Считаем именно это, а не число сканирований: отсканировать можно и чтобы
 * убедиться, что числа неверные. Сохранение без правки — единственное
 * действие, которым человек подтверждает состав, ничего не подтверждая
 * специально.
 */
export async function confirmBarcode(rawCode: string): Promise<void> {
  const code = normalizeBarcode(rawCode);
  if (!code) return;
  await getDb()
    .update(barcodes)
    .set({ confirmations: sql`${barcodes.confirmations} + 1` })
    .where(eq(barcodes.code, code));
}

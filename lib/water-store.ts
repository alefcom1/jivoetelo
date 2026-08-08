/**
 * Счётчик жидкости: работа с базой.
 *
 * Разделение то же, что у пары lib/catalog-photos.ts и
 * lib/catalog-photos-store.ts: правила — в чистом модуле (lib/water-log.ts),
 * здесь только чтение и запись. Один слой на обе поверхности — веб-кабинет
 * ходит сюда server action'ом, Mini App через /api/tg/water.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles, waterEntries } from "@/db/schema";
import { computeTdee, targetInputFromProfile } from "./targets.ts";
import {
  drinkGoalMl,
  estimateFoodWaterMl,
  MAX_ENTRY_ML,
  MIN_ENTRY_ML,
  sumMl,
  type WaterEntry,
} from "./water-log.ts";
import { getLatestWeightKg } from "./weight.ts";

export type WaterDay = {
  day: string;
  /** Выпито за день, мл. */
  drunkMl: number;
  /** Ориентир по напиткам или `null`, если плана ещё нет. */
  goalMl: number | null;
  /** Оценка воды, пришедшей с едой этого дня, мл. */
  foodMl: number;
  /** Есть ли что отменять — интерфейсу, чтобы не рисовать мёртвую кнопку. */
  canUndo: boolean;
};

/**
 * Записать глоток.
 *
 * Границы проверяются здесь, а не только в интерфейсе: сюда приходят два
 * разных клиента, и правило «не бывает записи в 0 мл» принадлежит данным, а
 * не форме. Возвращаем `false` вместо исключения — вызывающий сам решает,
 * что показать.
 */
export async function addWater(userId: number, day: string, ml: number): Promise<boolean> {
  const value = Math.round(ml);
  if (!Number.isFinite(value) || value < MIN_ENTRY_ML || value > MAX_ENTRY_ML) return false;
  await getDb().insert(waterEntries).values({ userId, onDate: day, ml: value });
  return true;
}

/**
 * Отменить последнюю запись за день.
 *
 * Именно последнюю, а не «вычесть столько же»: человек нажал кнопку лишний
 * раз и хочет вернуть как было. Ищем по id — он растёт вместе со временем
 * вставки, и two записи в одну секунду им всё равно упорядочены, в отличие
 * от `created_at`.
 */
export async function undoLastWater(userId: number, day: string): Promise<boolean> {
  const db = getDb();
  const last = await db
    .select({ id: waterEntries.id })
    .from(waterEntries)
    .where(and(eq(waterEntries.userId, userId), eq(waterEntries.onDate, day)))
    .orderBy(desc(waterEntries.id))
    .limit(1);
  const id = last[0]?.id;
  if (id === undefined) return false;
  await db.delete(waterEntries).where(eq(waterEntries.id, id));
  return true;
}

/** Записи за день — сырьё для суммы и для отмены. */
export async function listDayWater(userId: number, day: string): Promise<WaterEntry[]> {
  return getDb()
    .select({ id: waterEntries.id, ml: waterEntries.ml })
    .from(waterEntries)
    .where(and(eq(waterEntries.userId, userId), eq(waterEntries.onDate, day)))
    .orderBy(waterEntries.id);
}

/**
 * Всё, что нужно карточке счётчика за один заход.
 *
 * Три запроса вместо одного составного — тот же приём, что в getDaySummary:
 * читаемость дороже одного round-trip на экране, который открывают раз в
 * несколько часов.
 */
export async function getWaterDay(userId: number, day: string): Promise<WaterDay> {
  const [entries, foodMl, goalMl] = await Promise.all([
    listDayWater(userId, day),
    estimateDayFoodWaterMl(userId, day),
    getDrinkGoalMl(userId),
  ]);
  return {
    day,
    drunkMl: sumMl(entries),
    goalMl,
    foodMl,
    canUndo: entries.length > 0,
  };
}

/**
 * Вода из съеденного за день.
 *
 * Берём только то, что нужно оценке, — граммы и четыре макронутриента.
 * Калории здесь ни при чём: воду они не предсказывают (у масла их много, а
 * воды нет; у супа наоборот).
 */
export async function estimateDayFoodWaterMl(userId: number, day: string): Promise<number> {
  const db = getDb();
  const ids = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.eatenOn, day)));
  if (ids.length === 0) return 0;

  const items = await db
    .select({
      grams: mealItems.grams,
      proteinPer100: mealItems.proteinPer100,
      fatPer100: mealItems.fatPer100,
      carbsPer100: mealItems.carbsPer100,
      fiberPer100: mealItems.fiberPer100,
    })
    .from(mealItems)
    .where(inArray(mealItems.mealId, ids.map((m) => m.id)));

  return estimateFoodWaterMl(items);
}

/**
 * Ориентир по напиткам для человека.
 *
 * В расчёт идёт **расход**, а не цель по калориям: пить нужно под то, сколько
 * организм тратит, а не под то, на сколько человек решил недоесть. Поэтому
 * здесь computeTdee, а не kcalTarget из computeTargets.
 */
export async function getDrinkGoalMl(userId: number): Promise<number | null> {
  const db = getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = rows[0];
  if (!profile) return null;
  const weightKg = await getLatestWeightKg(userId);
  if (weightKg === null) return null;

  const tdeeKcal = computeTdee(targetInputFromProfile(profile, weightKg));
  return drinkGoalMl({ sex: profile.sexForFormula as "female" | "male", weightKg, tdeeKcal });
}

/**
 * Сколько выпито по дням за период — для выгрузки данных и будущих отчётов.
 * Пока не показывается нигде: заведено вместе с таблицей, чтобы экспорт
 * аккаунта не пришлось чинить отдельной задачей.
 */
export async function sumWaterByDay(userId: number): Promise<Array<{ day: string; ml: number }>> {
  const rows = await getDb()
    .select({ day: waterEntries.onDate, ml: sql<number>`sum(${waterEntries.ml})::int` })
    .from(waterEntries)
    .where(eq(waterEntries.userId, userId))
    .groupBy(waterEntries.onDate)
    .orderBy(waterEntries.onDate);
  return rows;
}

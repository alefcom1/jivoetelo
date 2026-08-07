/**
 * Награды: чтение и запись. Правила — в lib/awards.ts, здесь только база.
 *
 * Разделение то же, что у первых шагов: чистый модуль с правилами
 * проверяется тестами напрямую, а обвязка вокруг SQL живёт отдельно и
 * тестируется живым прогоном.
 */

import { count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, userAwards } from "@/db/schema";
import { awardByKey, isAwardKey, type Award, type AwardState } from "./awards.ts";
import type { SeasonDay } from "./season.ts";

export type EarnedAward = Award & { earnedOn: string };

/** Что человек уже взял — в порядке взятия, свежие сверху. */
export async function listAwards(userId: number): Promise<EarnedAward[]> {
  const rows = await getDb()
    .select({ key: userAwards.awardKey, earnedOn: userAwards.earnedOn })
    .from(userAwards)
    .where(eq(userAwards.userId, userId))
    .orderBy(desc(userAwards.earnedOn), desc(userAwards.id));

  const out: EarnedAward[] = [];
  for (const row of rows) {
    // Ключ из базы может оказаться от награды, которой больше нет: правила
    // живут в коде и переживают правки, строки — нет. Такую просто не
    // показываем, а не падаем на всём списке.
    const award = awardByKey(row.key);
    if (award) out.push({ ...award, earnedOn: row.earnedOn });
  }
  return out;
}

/** Ключи взятого — для сравнения с тем, что положено по состоянию. */
export async function storedAwardKeys(userId: number): Promise<string[]> {
  const rows = await getDb()
    .select({ key: userAwards.awardKey })
    .from(userAwards)
    .where(eq(userAwards.userId, userId));
  return rows.map((row) => row.key);
}

/**
 * Записать взятые награды.
 *
 * `onConflictDoNothing` обязателен, а не подстрахован проверкой в коде:
 * «Сегодня» бывает открыто в вебе и в Mini App одновременно, и оба экрана
 * считают взятое при загрузке. Проверка «есть ли уже» между чтением и
 * записью гонку не закрывает — её закрывает уникальный индекс.
 */
export async function grantAwards(userId: number, keys: readonly string[], onDate: string): Promise<void> {
  const values = [...new Set(keys.filter(isAwardKey))].map((awardKey) => ({ userId, awardKey, earnedOn: onDate }));
  if (values.length === 0) return;
  await getDb().insert(userAwards).values(values).onConflictDoNothing();
}

/**
 * Состояние для правил наград: всего приёмов пищи и лучшая серия.
 *
 * Дни с записями считает `computeStreak` по тому же списку дней, который
 * экраны и так грузят, поэтому сюда не входят — вызывающая сторона отдаёт
 * `totalDays` оттуда.
 */
export async function awardCounters(userId: number): Promise<Pick<AwardState, "mealCount">> {
  const rows = await getDb().select({ n: count() }).from(meals).where(eq(meals.userId, userId));
  return { mealCount: Number(rows[0]?.n ?? 0) };
}

/**
 * Дни и КБЖУ по дням — вход для среза месяц-к-месяцу (lib/season.ts).
 *
 * Считается на стороне базы, а не в коде: за год это несколько тысяч позиций,
 * и тащить их в приложение ради четырёх сумм незачем. Формулы те же, что в
 * lib/nutrition.ts, — на 100 г, поэтому деление на сто.
 */
export async function seasonDays(userId: number, fromDay: string): Promise<SeasonDay[]> {
  const rows = await getDb()
    .select({
      day: meals.eatenOn,
      meals: sql<number>`count(DISTINCT ${meals.id})::int`,
      kcal: sql<number>`coalesce(sum(${mealItems.grams} * ${mealItems.kcalPer100} / 100.0), 0)`,
      protein: sql<number>`coalesce(sum(${mealItems.grams} * ${mealItems.proteinPer100} / 100.0), 0)`,
      fiber: sql<number>`coalesce(sum(${mealItems.grams} * ${mealItems.fiberPer100} / 100.0), 0)`,
    })
    .from(meals)
    .leftJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(sql`${meals.userId} = ${userId} AND ${meals.eatenOn} >= ${fromDay}`)
    .groupBy(meals.eatenOn);

  return rows.map((row) => ({
    day: row.day,
    meals: Number(row.meals),
    kcal: Math.round(Number(row.kcal)),
    protein: Math.round(Number(row.protein)),
    fiber: Math.round(Number(row.fiber)),
  }));
}

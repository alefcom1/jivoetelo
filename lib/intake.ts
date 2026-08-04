// Свёртка строк дневника в дни — сырьё для разбора «блюдо → вес».
//
// Отдельно от lib/dish-impact.ts, потому что тот ходит в базу через `@/db`, а
// такой модуль не поднимается под голым `node --test`. То же разделение, что у
// пары lib/diary.ts (чистая группировка) и lib/meals.ts (чтение из базы).

import { isAlcoholKey } from "./dish-key.ts";
import { dayFlags, MIN_N_WITH, type DayIntake } from "./weight-response.ts";

type MealRow = { id: number; eatenOn: string; eatenTime: string };
type ItemRow = { mealId: number; dishKey: string | null; grams: number; kcalPer100: number };

/**
 * Сворачивает приёмы пищи в дни.
 *
 * Позиции без `dish_key` (записи старше миграции 0015, пока их не разберёт
 * scripts/backfill-dish-keys.mjs) в набор ключей не попадают, но день из
 * наблюдений не выбрасывают: их калории по-прежнему считаются, и день
 * остаётся годной контрольной точкой для других блюд.
 */
export function buildIntake(mealRows: MealRow[], itemRows: ItemRow[]): DayIntake[] {
  const itemsByMeal = new Map<number, ItemRow[]>();
  for (const item of itemRows) {
    const list = itemsByMeal.get(item.mealId) ?? [];
    list.push(item);
    itemsByMeal.set(item.mealId, list);
  }

  const byDay = new Map<string, { kcal: number; mealCount: number; keys: Set<string>; lastMealTime: string | null; hasAlcohol: boolean }>();
  for (const meal of mealRows) {
    const day = byDay.get(meal.eatenOn)
      ?? { kcal: 0, mealCount: 0, keys: new Set<string>(), lastMealTime: null, hasAlcohol: false };
    day.mealCount += 1;
    if (day.lastMealTime === null || meal.eatenTime > day.lastMealTime) day.lastMealTime = meal.eatenTime;
    for (const item of itemsByMeal.get(meal.id) ?? []) {
      day.kcal += (item.kcalPer100 * item.grams) / 100;
      if (!item.dishKey) continue;
      day.keys.add(item.dishKey);
      if (isAlcoholKey(item.dishKey)) day.hasAlcohol = true;
    }
    byDay.set(meal.eatenOn, day);
  }

  return [...byDay.entries()]
    .map(([day, value]) => ({
      day,
      kcal: Math.round(value.kcal),
      mealCount: value.mealCount,
      keys: [...value.keys],
      lastMealTime: value.lastMealTime,
      hasAlcohol: value.hasAlcohol,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Какие ключи вообще имеет смысл проверять.
 *
 * Только встретившиеся хотя бы в `MIN_N_WITH` днях: остальные всё равно
 * отсеются в `compareGroup`, но попав в список кандидатов, они раздули бы
 * поправку на множественные сравнения и придушили бы настоящие находки.
 * Поправка должна считаться по числу реально проверенных гипотез, а не по
 * числу всего, что человек когда-либо ел.
 */
export function pickCandidates(intake: DayIntake[]): string[] {
  const counts = new Map<string, number>();
  for (const day of intake) {
    // Признаки дня (алкоголь, поздний ужин) — такие же кандидаты, как блюда,
    // но лежат они не в `keys`, а выводятся из дня. Забудь их здесь — и они
    // никогда не попали бы в разбор, хотя наблюдений у них больше всего.
    for (const key of [...day.keys, ...dayFlags(day)]) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_N_WITH)
    .map(([key]) => key)
    .sort();
}

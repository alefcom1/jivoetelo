// Чистая логика экрана «Дневник» (Mini App v2): группировка позиций по
// приёму пищи, короткое превью состава для списка и защита дня от будущего.
//
// Разделение то же, что и в lib/adherence.ts: запросы к базе остаются в
// lib/meals.ts, а то, что можно проверить без базы, — здесь и покрыто
// тестами (tests/diary.test.mjs).

import { MEAL_TYPE_LABELS } from "./dates.ts";
import { sumTotals, type NutritionItem, type NutritionTotals } from "./nutrition.ts";

export type DiaryItemRow = NutritionItem & { mealId: number; name: string };

export type DiaryMealRow = {
  id: number;
  eatenTime: string;
  mealType: string;
  photoKey: string | null;
};

export type DiaryMeal = {
  id: number;
  time: string;
  mealType: string;
  typeLabel: string;
  photoKey: string | null;
  itemsPreview: string;
  itemCount: number;
  totals: NutritionTotals;
};

/** Сколько позиций показываем в превью списка, прежде чем свернуть остаток в «и ещё N». */
const PREVIEW_LIMIT = 3;

/**
 * Короткое превью состава приёма пищи для строки в списке: «омлет, тост,
 * кофе» или «омлет, тост, кофе и ещё 2» при более длинном составе.
 */
export function previewItemNames(names: string[], limit = PREVIEW_LIMIT): string {
  if (names.length <= limit) return names.join(", ");
  const rest = names.length - limit;
  return `${names.slice(0, limit).join(", ")} и ещё ${rest}`;
}

/**
 * Группирует плоские строки meal_items по приёму пищи и считает итоги —
 * список для «Дневника», отсортированный по времени. Строки от базы
 * приходят без гарантии порядка (порядок отдаёт СУБД по своему усмотрению),
 * поэтому сортировка по `eatenTime` — часть этой функции, а не запроса.
 */
export function buildDiaryMeals(meals: DiaryMealRow[], items: DiaryItemRow[]): DiaryMeal[] {
  const itemsByMeal = new Map<number, DiaryItemRow[]>();
  for (const item of items) {
    const list = itemsByMeal.get(item.mealId) ?? [];
    list.push(item);
    itemsByMeal.set(item.mealId, list);
  }

  return meals
    .slice()
    .sort((a, b) => a.eatenTime.localeCompare(b.eatenTime))
    .map((meal) => {
      const mealItems = itemsByMeal.get(meal.id) ?? [];
      return {
        id: meal.id,
        time: meal.eatenTime,
        mealType: meal.mealType,
        typeLabel: MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other,
        photoKey: meal.photoKey,
        itemsPreview: previewItemNames(mealItems.map((item) => item.name)),
        itemCount: mealItems.length,
        totals: sumTotals(mealItems),
      };
    });
}

/**
 * Итог дня — по тому же плоскому списку позиций, что и приёмы пищи выше:
 * так сумма в шапке «Дневника» всегда совпадает с суммой по карточкам ниже,
 * а не считается отдельным (и потенциально расходящимся из-за округлений) путём.
 */
export function diaryDayTotals(items: NutritionItem[]): NutritionTotals {
  return sumTotals(items);
}

/**
 * День дневника не может быть в будущем — заглянуть в ещё не наступивший
 * день нечестно, там объективно ничего нет. Стрелка «вперёд» в интерфейсе
 * этого не допускает, но API проверяет независимо: прямой запрос с чужой
 * датой не должен обходить эту границу.
 */
export function clampDiaryDay(day: string, today: string): string {
  return day > today ? today : day;
}

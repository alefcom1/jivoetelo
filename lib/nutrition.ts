export type NutritionPer100 = {
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
};

export type NutritionItem = NutritionPer100 & { grams: number };

export type NutritionTotals = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** КБЖУ одной позиции: значения на 100 г, умноженные на вес порции. */
export function itemTotals(item: NutritionItem): NutritionTotals {
  const factor = item.grams / 100;
  return {
    kcal: Math.round(item.kcalPer100 * factor),
    protein: round1(item.proteinPer100 * factor),
    fat: round1(item.fatPer100 * factor),
    carbs: round1(item.carbsPer100 * factor),
    fiber: round1(item.fiberPer100 * factor),
  };
}

/** Сумма по списку позиций (приём пищи или весь день). */
export function sumTotals(items: NutritionItem[]): NutritionTotals {
  const totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
  for (const item of items) {
    const t = itemTotals(item);
    totals.kcal += t.kcal;
    totals.protein += t.protein;
    totals.fat += t.fat;
    totals.carbs += t.carbs;
    totals.fiber += t.fiber;
  }
  return {
    kcal: Math.round(totals.kcal),
    protein: round1(totals.protein),
    fat: round1(totals.fat),
    carbs: round1(totals.carbs),
    fiber: round1(totals.fiber),
  };
}

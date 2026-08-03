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

/**
 * Потолки значений на 100 г.
 *
 * Числа не взяты с потолка: 900 ккал — чуть выше чистого жира (899), больше
 * не бывает ни у чего; 100 г белка, жиров или углеводов на 100 г продукта —
 * это уже сам продукт целиком; 50 г клетчатки — вдвое больше, чем у отрубей,
 * рекордсмена этой колонки.
 *
 * Таблица одна на всех, потому что ограничивают одно и то же в трёх местах:
 * при сохранении приёма пищи, при разборе моделью и при заведении карточки
 * штрихкода. Разойдись они — и в базу штрихкодов легло бы значение, которое
 * дневник при сохранении молча урежет, то есть человек увидел бы в карточке
 * одно, а в записи другое.
 */
export const PER_100_CAPS = { kcal: 900, protein: 100, fat: 100, carbs: 100, fiber: 50 } as const;

export type Per100Field = keyof typeof PER_100_CAPS;

/** Значение на 100 г из недоверенного источника: мусор становится нулём. */
export function clampPer100(field: Per100Field, value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(PER_100_CAPS[field], parsed);
}

/**
 * Позиция, у которой не заполнено вообще ничего.
 *
 * Возникает не из разбора, а из ручного добавления: поля «на 100 г» лежат под
 * раскрывающимся блоком, и позицию легко сохранить с нулями во всех числах.
 * В дневнике она потом выглядит как «Салат овощной, 300 г — 0 ккал», и по
 * этой записи невозможно понять, то ли салат ничего не весит в калориях, то
 * ли числа просто забыли ввести.
 *
 * Проверка именно на «все нули», а не на «ноль калорий»: вода, чай и чёрный
 * кофе честно дают ноль, и объявлять их ошибкой нельзя. А вот еда, у которой
 * заодно ноль белка, жиров и углеводов, — это незаполненная форма.
 */
export function isBlankNutrition(item: NutritionPer100): boolean {
  return (
    item.kcalPer100 === 0 &&
    item.proteinPer100 === 0 &&
    item.fatPer100 === 0 &&
    item.carbsPer100 === 0 &&
    item.fiberPer100 === 0
  );
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

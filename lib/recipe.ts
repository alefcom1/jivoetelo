/**
 * Калорийность готового блюда по ингредиентам.
 *
 * ## Зачем это отдельный расчёт
 *
 * «Сколько калорий в моём супе» — вопрос, на который не отвечает ни один
 * справочник: суп у каждого свой. Сложить калорийность ингредиентов умеет
 * любой калькулятор, но дальше начинается то, что почти все пропускают, —
 * **вес готового блюда не равен сумме весов сырых продуктов**.
 *
 * Каша впитывает воду и тяжелеет втрое; мясо на сковороде теряет четверть
 * массы; суп выкипает. Калории при этом не меняются: вода уходит и приходит,
 * энергия — нет. Поэтому «калорийность на 100 г» у сырой суммы и у готового
 * блюда различаются в разы, и именно этой ошибкой испорчено большинство
 * домашних подсчётов.
 *
 * ## Как считаем
 *
 * 1. Складываем энергию и нутриенты всех ингредиентов — по их собственному
 *    состоянию (справочник даёт крупы уже отварными, мясо сырым).
 * 2. Спрашиваем **вес готового блюда** — взвесить кастрюлю проще, чем
 *    угадывать коэффициенты. Если человек его не знает, оцениваем по
 *    типовым правилам изменения массы.
 * 3. Делим итог на этот вес — получаем честные «ккал на 100 г готового».
 * 4. Считаем порцию: вес порции × калорийность готового.
 *
 * Тонкость: сумма нутриентов не зависит от того, угадали ли мы вес готового.
 * Ошибка в весе меняет только пересчёт «на 100 г», а итог всей кастрюли
 * остаётся верным — об этом сказано и на странице.
 */

import { FOOD_REFERENCE, type ReferenceFood } from "./food-reference.ts";

export type RecipeItem = {
  /** Название из справочника. */
  name: string;
  /** Сколько положили, г. */
  grams: number;
};

export type RecipeTotals = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  /** Сумма сырых весов, г. */
  rawWeight: number;
};

export type RecipeResult = {
  totals: RecipeTotals;
  /** Вес готового блюда, г — заданный или оценённый. */
  cookedWeight: number;
  /** На 100 г готового. */
  per100: { kcal: number; protein: number; fat: number; carbs: number; fiber: number };
  /** На указанную порцию. */
  perPortion: { kcal: number; protein: number; fat: number; carbs: number; fiber: number; grams: number };
};

/**
 * Как меняется масса при готовке. Числа — типовые для домашней кухни;
 * страница показывает их таблицей, чтобы человек мог поправить оценку.
 */
export const COOKING_LOSS = [
  { key: "none", label: "Не готовится (салат, бутерброд)", factor: 1 },
  { key: "boil_soup", label: "Суп: варится под крышкой", factor: 0.95 },
  { key: "stew", label: "Тушение", factor: 0.85 },
  { key: "bake", label: "Запекание", factor: 0.8 },
  { key: "fry", label: "Жарка", factor: 0.75 },
  { key: "boil_open", label: "Варка без крышки, выпаривание", factor: 0.7 },
] as const;

export type CookingKey = (typeof COOKING_LOSS)[number]["key"];

export function findFood(name: string): ReferenceFood | undefined {
  return FOOD_REFERENCE.find((food) => food.name === name);
}

/** Складывает ингредиенты. Неизвестные названия молча пропускаются. */
export function sumRecipe(items: RecipeItem[]): RecipeTotals {
  const totals: RecipeTotals = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, rawWeight: 0 };

  for (const item of items) {
    const food = findFood(item.name);
    if (!food || !(item.grams > 0)) continue;
    const k = item.grams / 100;
    totals.kcal += food.kcal * k;
    totals.protein += food.protein * k;
    totals.fat += food.fat * k;
    totals.carbs += food.carbs * k;
    totals.fiber += food.fiber * k;
    totals.rawWeight += item.grams;
  }

  return {
    kcal: Math.round(totals.kcal),
    protein: round1(totals.protein),
    fat: round1(totals.fat),
    carbs: round1(totals.carbs),
    fiber: round1(totals.fiber),
    rawWeight: Math.round(totals.rawWeight),
  };
}

/**
 * Полный расчёт. `cookedWeight` — вес готового блюда; если не задан,
 * оценивается по способу готовки.
 */
export function computeRecipe(input: {
  items: RecipeItem[];
  cooking: CookingKey;
  cookedWeight?: number;
  portionG: number;
}): RecipeResult {
  const totals = sumRecipe(input.items);
  const factor = COOKING_LOSS.find((c) => c.key === input.cooking)?.factor ?? 1;
  const cooked = Math.max(1, Math.round(input.cookedWeight && input.cookedWeight > 0
    ? input.cookedWeight
    : totals.rawWeight * factor));

  const per100 = {
    kcal: Math.round((totals.kcal / cooked) * 100),
    protein: round1((totals.protein / cooked) * 100),
    fat: round1((totals.fat / cooked) * 100),
    carbs: round1((totals.carbs / cooked) * 100),
    fiber: round1((totals.fiber / cooked) * 100),
  };

  const portion = Math.max(0, input.portionG);
  const k = portion / cooked;

  return {
    totals,
    cookedWeight: cooked,
    per100,
    perPortion: {
      grams: Math.round(portion),
      kcal: Math.round(totals.kcal * k),
      protein: round1(totals.protein * k),
      fat: round1(totals.fat * k),
      carbs: round1(totals.carbs * k),
      fiber: round1(totals.fiber * k),
    },
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Поиск по справочнику для подсказок ввода. */
export function searchFoods(query: string, limit = 8): ReferenceFood[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const starts: ReferenceFood[] = [];
  const contains: ReferenceFood[] = [];
  for (const food of FOOD_REFERENCE) {
    const name = food.name.toLowerCase();
    if (name.startsWith(needle)) starts.push(food);
    else if (name.includes(needle)) contains.push(food);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

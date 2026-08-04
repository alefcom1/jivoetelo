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

/* ===== Пересчёт закладки на другое число порций =====
 *
 * Рецепт написан на четыре порции, а готовить надо на шесть. Арифметика
 * школьная, но в уме её делают с ошибками — особенно когда в списке
 * полтора десятка позиций и половина в неудобных числах.
 *
 * Главное, что стоит сказать человеку и чего не говорит ни один
 * пересчётчик: **КБЖУ одной порции при пересчёте не меняется**. Меняется
 * закладка и вес кастрюли, но порция остаётся той же. Это снимает
 * типичный страх «если приготовлю больше, будет калорийнее».
 */

/** Ингредиент после пересчёта: было, стало и на сколько изменилось. */
export type ScaledItem = { name: string; from: number; to: number; delta: number };

export type ScaleResult = {
  /** Во сколько раз изменилась закладка. */
  factor: number;
  items: ScaledItem[];
  /** Сумма сырых весов до и после. */
  rawWeightFrom: number;
  rawWeightTo: number;
  /** КБЖУ одной порции — одинаковое до и после, в этом весь смысл. */
  perPortion: { kcal: number; protein: number; fat: number; carbs: number; fiber: number };
  /** КБЖУ всей новой закладки. */
  totalTo: { kcal: number; protein: number; fat: number; carbs: number; fiber: number };
};

/**
 * Пересчитывает список ингредиентов с `fromPortions` порций на `toPortions`.
 *
 * Округляем до целых граммов: доли грамма на кухне не отмерить, а сумма
 * ошибок округления на десятке позиций меньше погрешности самих весов.
 */
export function scaleRecipe(
  items: RecipeItem[],
  fromPortions: number,
  toPortions: number,
): ScaleResult {
  const from = Math.max(1, Math.round(fromPortions));
  const to = Math.max(1, Math.round(toPortions));
  const factor = to / from;

  const scaled: ScaledItem[] = items
    .filter((item) => item.grams > 0)
    .map((item) => {
      const next = Math.round(item.grams * factor);
      return { name: item.name, from: Math.round(item.grams), to: next, delta: next - Math.round(item.grams) };
    });

  const totals = sumRecipe(items);
  const perPortion = {
    kcal: Math.round(totals.kcal / from),
    protein: round1(totals.protein / from),
    fat: round1(totals.fat / from),
    carbs: round1(totals.carbs / from),
    fiber: round1(totals.fiber / from),
  };

  return {
    factor: Math.round(factor * 100) / 100,
    items: scaled,
    rawWeightFrom: totals.rawWeight,
    rawWeightTo: scaled.reduce((sum, item) => sum + item.to, 0),
    perPortion,
    totalTo: {
      kcal: perPortion.kcal * to,
      protein: round1(perPortion.protein * to),
      fat: round1(perPortion.fat * to),
      carbs: round1(perPortion.carbs * to),
      fiber: round1(perPortion.fiber * to),
    },
  };
}

/**
 * Что в рецепте не масштабируется линейно. Это и есть содержательная часть
 * страницы: умножить на 1,5 умеет калькулятор в телефоне, а знать, что соль
 * и разрыхлитель так умножать нельзя, — нет.
 */
export const SCALING_NOTES = [
  {
    title: "Соль, специи и острое — по вкусу, а не по коэффициенту",
    text:
      "Восприятие солёного и острого нелинейно: двойная порция супа с двойной солью кажется пересоленной. Умножайте на коэффициент всё, кроме приправ, а приправы добавляйте примерно на треть меньше расчётного и досаливайте в конце.",
  },
  {
    title: "Разрыхлитель, сода и дрожжи — отдельный случай",
    text:
      "В выпечке разрыхлители работают в паре с объёмом теста и температурой, и прямое умножение даёт либо плоский корж, либо привкус соды. Для теста надёжнее приготовить две закладки по исходному рецепту, чем одну удвоенную.",
  },
  {
    title: "Время готовки не умножается",
    text:
      "Двойная порция варится не вдвое дольше, а немного дольше — на прогрев большей массы. А вот жарить двойную порцию на той же сковороде нельзя: продукты начнут тушиться в собственном соку вместо того, чтобы жариться. Либо большая сковорода, либо две партии.",
  },
  {
    title: "Посуда — ограничение жёстче арифметики",
    text:
      "Полуторная закладка в ту же кастрюлю обычно влезает, двойная — почти никогда. Прикиньте объём заранее: сумма сырых весов в граммах примерно равна объёму в миллилитрах, и кастрюлю стоит брать с запасом в треть.",
  },
] as const;

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

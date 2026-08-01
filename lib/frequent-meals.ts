// «Как обычно?» — частые приёмы пищи для повтора в один тап.
//
// Зачем. Люди едят одно и то же: овсянка по утрам, та же гречка с курицей
// на обед. Каждый раз это либо снимок с разбором (несколько секунд ожидания
// и списание дневной квоты), либо набор текста. Повтор уже записанного не
// стоит ни того, ни другого — и работает, когда разбор выключен вовсе.
//
// В исследовании (docs/market-research.md, раздел 9) «как обычно?» стояло в
// быстрых победах — выше и голосового ввода, и штрихкодов. Причина та же,
// по которой штрихкоды вообще привлекательны: записывать еду утомительно.
// Только здесь для этого не нужны ни внешняя база, ни камера, ни новые
// зависимости.
//
// Модуль чистый: группировка и ранжирование — правила, их удобнее проверять
// тестами отдельно от SQL и разметки.

export type PastMealItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

export type PastMeal = {
  mealId: number;
  /** Дата приёма пищи в виде ГГГГ-ММ-ДД — по ней считается свежесть. */
  eatenOn: string;
  mealType: string;
  items: PastMealItem[];
};

export type FrequentMeal = {
  /** Устойчивый ключ состава — им же React различает строки списка. */
  key: string;
  /** Названия позиций через запятую: «Овсянка на воде, Банан». */
  title: string;
  mealType: string;
  /** Сколько раз этот состав встречался в окне наблюдения. */
  count: number;
  lastEatenOn: string;
  kcal: number;
  protein: number;
  items: PastMealItem[];
};

/** Больше не показываем: список подсказок перестаёт быть подсказкой. */
export const MAX_FREQUENT = 6;
/** Реже двух раз — это не «как обычно», а разовый случай. */
export const MIN_OCCURRENCES = 2;

function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/**
 * Ключ состава: отсортированные нормализованные названия позиций. Вес в
 * ключ не входит — «овсянка 250 г» и «овсянка 200 г» это один и тот же
 * завтрак с разной порцией, а не два разных блюда. Порция берётся из
 * последнего раза (см. ниже) и всё равно правится степпером.
 */
export function compositionKey(items: Array<{ name: string }>): string {
  return items.map((item) => normalize(item.name)).sort().join(" + ");
}

function totals(items: PastMealItem[]): { kcal: number; protein: number } {
  let kcal = 0;
  let protein = 0;
  for (const item of items) {
    kcal += (item.kcalPer100 * item.grams) / 100;
    protein += (item.proteinPer100 * item.grams) / 100;
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein * 10) / 10 };
}

/**
 * Группирует прошлые приёмы пищи по составу и возвращает самые частые.
 *
 * Порядок: сначала по числу повторов, при равенстве — по свежести. Так
 * наверх попадает то, что человек ест и часто, и до сих пор; иначе завтрак,
 * которым он питался месяц назад и бросил, годами держался бы первым.
 *
 * Порции и КБЖУ берутся из **последнего** раза: если человек однажды
 * поправил вес порции или уточнил разбор, повтор должен наследовать
 * исправленное, а не первую попытку.
 */
function groupByComposition(meals: PastMeal[]): FrequentMeal[] {
  const groups = new Map<string, PastMeal[]>();
  for (const meal of meals) {
    if (meal.items.length === 0) continue;
    const key = compositionKey(meal.items);
    const list = groups.get(key) ?? [];
    list.push(meal);
    groups.set(key, list);
  }

  const result: FrequentMeal[] = [];
  for (const [key, list] of groups) {
    // Самый свежий из группы: и порции, и тип приёма пищи берём у него.
    const latest = list.reduce((a, b) => (b.eatenOn > a.eatenOn ? b : a));
    const { kcal, protein } = totals(latest.items);
    result.push({
      key,
      title: latest.items.map((item) => item.name).join(", "),
      mealType: latest.mealType,
      count: list.length,
      lastEatenOn: latest.eatenOn,
      kcal,
      protein,
      items: latest.items,
    });
  }
  return result;
}

/** Свежее — выше. Вынесено, чтобы порядок «недавнего» был ровно один. */
function byFreshness(a: FrequentMeal, b: FrequentMeal): number {
  return a.lastEatenOn < b.lastEatenOn ? 1 : a.lastEatenOn > b.lastEatenOn ? -1 : 0;
}

export function frequentMeals(meals: PastMeal[], limit = MAX_FREQUENT): FrequentMeal[] {
  return groupByComposition(meals)
    .filter((group) => group.count >= MIN_OCCURRENCES)
    .sort((a, b) => b.count - a.count || byFreshness(a, b))
    .slice(0, limit);
}

/**
 * Что можно повторить в один тап: сначала привычное, потом просто недавнее.
 *
 * ## Почему одного «как обычно» оказалось мало
 *
 * Порог в два повтора выглядел разумно — и на деле почти никогда не
 * срабатывал. Состав узнаётся по названиям позиций, а названия приходят от
 * разбора снимка: одна и та же тарелка сегодня «Овсяная каша на молоке», а
 * завтра «Овсянка с молоком». Ключи разные, повтора нет, блок не появляется —
 * и человек, который две недели исправно ведёт дневник, не видит на «Камере»
 * ни одной знакомой строки.
 *
 * Смягчать сравнение названий — плохой путь: «куриная грудка» и «куриный
 * бульон» разойдутся по любому порогу похожести не там, где надо, и повтор
 * подставит не то блюдо молча. Надёжнее не угадывать, а показать недавнее как
 * недавнее: строка честно говорит «вчера» вместо «5 раз за два месяца», и
 * человек сам решает, то это или не то.
 *
 * Порядок остаётся осмысленным: привычное всегда выше разового, потому что
 * повтор — более сильный сигнал, чем свежесть.
 */
export function repeatableMeals(meals: PastMeal[], limit = MAX_FREQUENT): FrequentMeal[] {
  const groups = groupByComposition(meals);
  const repeated = groups
    .filter((group) => group.count >= MIN_OCCURRENCES)
    .sort((a, b) => b.count - a.count || byFreshness(a, b));
  const once = groups
    .filter((group) => group.count < MIN_OCCURRENCES)
    .sort(byFreshness);
  return [...repeated, ...once].slice(0, limit);
}

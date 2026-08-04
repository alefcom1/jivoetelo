/**
 * Упрощённый учёт: тарелка вместо чисел.
 *
 * ## Зачем
 *
 * Главная находка исследования (docs/research-2026-08.md, раздел 7.4):
 * упрощённый самомониторинг даёт приверженность **97% против 49% при той же
 * потере веса на шести месяцах**. Это самый сильный воспроизводимый рычаг
 * удержания из найденных — и он же прямое продолжение того, что мы и так
 * говорим: смотреть надо на ритм, а не на точность до грамма.
 *
 * Второй довод из того же исследования: разбор 13 799 негативных сообщений
 * (UCL) показал, что ведущая тема — стыд при записи еды, которую человек
 * считает нездоровой. В качественном режиме стыдиться нечего: там нет числа,
 * которое можно сравнить с бюджетом.
 *
 * ## Чем это НЕ является
 *
 * Это не «скрыть калории». Тот режим убирает цифры с экрана, но оставляет
 * полный ввод: человек по-прежнему называет продукты и правит граммы.
 * Здесь упрощается сама работа — человек отмечает, что было на тарелке и
 * сколько её было, и всё.
 *
 * ## Откуда числа
 *
 * За каждой частью тарелки стоит представитель из нашего же справочника
 * (lib/food-reference.ts) — тот, который в этой роли встречается чаще всего.
 * Выдумывать «средний белок» не стали: усреднённое по категории число ничем
 * не лучше конкретного и хуже тем, что его нельзя проверить глазами.
 *
 * Точность здесь заведомо грубая, и это честно отражено: позиции получают
 * уверенность `low`, а на экране вместо точного числа стоит диапазон.
 * Обещать граммы там, где человек нажал «как обычно», нельзя.
 */

import type { Confidence } from "./confidence.ts";

/** Часть тарелки. */
export type PlatePart = "protein" | "grain" | "vegetable" | "fat" | "fruit" | "sweet";

/** Сколько было еды относительно обычной порции. */
export type PortionSize = "less" | "usual" | "more";

export type PlatePartInfo = {
  key: PlatePart;
  /** Как называется на экране. */
  label: string;
  /** Что сюда входит — подсказка под названием. */
  hint: string;
  /** Название позиции, которая попадёт в дневник. */
  itemName: string;
  /** Обычная порция этой части, г. */
  baseGrams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
};

/**
 * Части тарелки и их представители.
 *
 * Числа — из справочника, у каждого указан прообраз. Менять их следует
 * вместе с ним: разойдясь, «куриная грудка» в обычном режиме и «белковое» в
 * упрощённом дадут за один и тот же обед разные калории.
 */
export const PLATE_PARTS: PlatePartInfo[] = [
  {
    key: "protein",
    label: "Белковое",
    hint: "мясо, рыба, птица, яйца, творог",
    itemName: "Белковое блюдо",
    // Куриная грудка отварная — самый частый белок в дневниках.
    baseGrams: 150,
    kcalPer100: 165, proteinPer100: 31, fatPer100: 3.6, carbsPer100: 0, fiberPer100: 0,
  },
  {
    key: "grain",
    label: "Крупа или гарнир",
    hint: "каша, макароны, картофель, хлеб",
    itemName: "Гарнир",
    // Гречка отварная — середина между рисом и макаронами.
    baseGrams: 180,
    kcalPer100: 110, proteinPer100: 4.2, fatPer100: 1.1, carbsPer100: 21.3, fiberPer100: 2.7,
  },
  {
    key: "vegetable",
    label: "Овощи",
    hint: "салат, тушёные, свежие",
    itemName: "Овощи",
    // Овощи тушёные: середина между свежим салатом и обжаренными.
    baseGrams: 150,
    kcalPer100: 70, proteinPer100: 1.6, fatPer100: 3.6, carbsPer100: 8, fiberPer100: 2.2,
  },
  {
    key: "fat",
    label: "Жирное",
    hint: "масло, соус, сыр, орехи",
    itemName: "Масло или соус",
    // Порция маленькая: ложка масла, ломтик сыра, горсть орехов. Именно эта
    // часть тарелки чаще всего и «не считается» — а весит больше всего.
    baseGrams: 20,
    kcalPer100: 700, proteinPer100: 3, fatPer100: 75, carbsPer100: 2, fiberPer100: 0.5,
  },
  {
    key: "fruit",
    label: "Фрукт или ягоды",
    hint: "яблоко, банан, горсть ягод",
    itemName: "Фрукты",
    baseGrams: 150,
    kcalPer100: 60, proteinPer100: 0.7, fatPer100: 0.3, carbsPer100: 14, fiberPer100: 2,
  },
  {
    key: "sweet",
    label: "Сладкое",
    hint: "десерт, шоколад, сахар в напитке",
    itemName: "Сладкое",
    baseGrams: 50,
    kcalPer100: 400, proteinPer100: 5, fatPer100: 15, carbsPer100: 62, fiberPer100: 1.5,
  },
];

export const PORTION_LABELS: Record<PortionSize, string> = {
  less: "Меньше обычного",
  usual: "Как обычно",
  more: "Больше обычного",
};

/**
 * Множители порции.
 *
 * Не 0,5 / 1 / 2: «меньше обычного» — это чуть меньше, а не половина, и
 * «больше» — добавка, а не двойная тарелка. Ровные множители выглядят
 * убедительнее, чем есть, а ошибка на них выходит вдвое больше.
 */
export const PORTION_FACTORS: Record<PortionSize, number> = { less: 0.7, usual: 1, more: 1.4 };

export type SimpleMealInput = {
  parts: PlatePart[];
  portion: PortionSize;
};

export type SimpleMealItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: Confidence;
};

const PART_BY_KEY = new Map(PLATE_PARTS.map((part) => [part.key, part]));

/**
 * Превращает отмеченную тарелку в позиции дневника.
 *
 * Уверенность всегда `low`, и это не перестраховка: человек не называл ни
 * продукта, ни веса — он сказал «было белковое, как обычно». Пометить такую
 * запись как точную значит соврать в единственном месте, где интерфейс
 * говорит о своей точности.
 *
 * Порядок частей — как в PLATE_PARTS, а не как их нажимали: иначе один и тот
 * же обед выглядел бы в дневнике по-разному в зависимости от порядка
 * нажатий.
 */
export function buildSimpleMeal(input: SimpleMealInput): SimpleMealItem[] {
  const factor = PORTION_FACTORS[input.portion] ?? 1;
  const chosen = new Set(input.parts);

  return PLATE_PARTS.filter((part) => chosen.has(part.key)).map((part) => ({
    name: part.itemName,
    grams: Math.round(part.baseGrams * factor),
    kcalPer100: part.kcalPer100,
    proteinPer100: part.proteinPer100,
    fatPer100: part.fatPer100,
    carbsPer100: part.carbsPer100,
    fiberPer100: part.fiberPer100,
    confidence: "low" as Confidence,
  }));
}

/**
 * Диапазон энергии для такой записи.
 *
 * ±30% — не круглое число из головы, а порядок ошибки, который даёт сама
 * постановка вопроса: «как обычно» у одного человека и у другого различается
 * примерно так. Показывать одно число здесь нельзя: точность, которой нет,
 * читается как обещание.
 */
export const SIMPLE_UNCERTAINTY = 0.3;

export function simpleKcalRange(items: SimpleMealItem[]): { min: number; max: number } {
  const kcal = items.reduce((sum, item) => sum + (item.kcalPer100 * item.grams) / 100, 0);
  return {
    min: Math.round((kcal * (1 - SIMPLE_UNCERTAINTY)) / 10) * 10,
    max: Math.round((kcal * (1 + SIMPLE_UNCERTAINTY)) / 10) * 10,
  };
}

export function isPlatePart(value: string): value is PlatePart {
  return PART_BY_KEY.has(value as PlatePart);
}

export function isPortionSize(value: string): value is PortionSize {
  return value === "less" || value === "usual" || value === "more";
}

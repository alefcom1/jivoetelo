/**
 * Соль и добавленный сахар: две нормы ВОЗ, о которых почти не считают.
 *
 * ## Почему вместе в одном модуле
 *
 * У них одинаковая логика: есть норма от международного органа, есть
 * реальное потребление, которое её заметно превышает, и есть скрытые
 * источники, о которых человек не подозревает. Разные страницы, общий код.
 *
 * ## Соль
 *
 * ВОЗ: менее 5 г соли в сутки для взрослого, то есть менее 2 г натрия.
 * Реальное потребление в России — порядка 10–12 г. Ключевая тонкость:
 * солонка даёт меньшую часть, основное приходит с хлебом, колбасой, сыром
 * и готовой едой. Поэтому калькулятор считает не «сколько досолить», а
 * складывает типовые источники.
 *
 * ## Сахар
 *
 * ВОЗ: добавленные сахара — менее 10% суточной калорийности, а лучше менее
 * 5%. Важно, что это именно **добавленные** сахара: сахар из целого фрукта
 * и молока в норму не входит. Считаем в граммах, в чайных ложках и в банках
 * газировки — так число становится понятным.
 */

/** Норма ВОЗ по соли, г/сут. */
export const SALT_LIMIT_G = 5;
/** Столько же в натрии, мг. */
export const SODIUM_LIMIT_MG = 2000;
/** Коэффициент перевода: 1 г соли ≈ 400 мг натрия. */
export const SODIUM_PER_SALT_G = 400;

export type SaltSource = {
  name: string;
  /** Соли в типичной порции, г. */
  perPortion: number;
  portion: string;
};

/** Типовые источники соли в российском рационе. */
export const SALT_SOURCES: SaltSource[] = [
  { name: "Хлеб", perPortion: 0.5, portion: "2 ломтика, 70 г" },
  { name: "Сыр", perPortion: 0.9, portion: "30 г" },
  { name: "Колбаса варёная", perPortion: 1.1, portion: "50 г" },
  { name: "Сосиски", perPortion: 1.8, portion: "2 шт., 100 г" },
  { name: "Суп из пакетика", perPortion: 2.4, portion: "порция" },
  { name: "Солёные огурцы", perPortion: 1.5, portion: "100 г" },
  { name: "Консервы рыбные", perPortion: 1.3, portion: "100 г" },
  { name: "Чипсы", perPortion: 1.0, portion: "50 г" },
  { name: "Соевый соус", perPortion: 2.7, portion: "столовая ложка" },
  { name: "Досаливание за столом", perPortion: 1.2, portion: "щепотка ×3" },
  { name: "Соль при готовке", perPortion: 2.0, portion: "на порцию" },
];

export type SaltResult = {
  totalG: number;
  sodiumMg: number;
  /** Во сколько раз превышена норма ВОЗ (меньше 1 — норма соблюдена). */
  ratio: number;
  zone: "ok" | "above" | "high";
};

export function computeSalt(selected: Record<string, number>): SaltResult {
  let total = 0;
  for (const source of SALT_SOURCES) {
    total += (selected[source.name] ?? 0) * source.perPortion;
  }
  const rounded = Math.round(total * 10) / 10;
  const ratio = Math.round((rounded / SALT_LIMIT_G) * 100) / 100;
  return {
    totalG: rounded,
    sodiumMg: Math.round(rounded * SODIUM_PER_SALT_G),
    ratio,
    zone: ratio <= 1 ? "ok" : ratio <= 2 ? "above" : "high",
  };
}

/** Норма ВОЗ по добавленному сахару: доля суточной калорийности. */
export const SUGAR_SOFT_LIMIT = 0.1;
export const SUGAR_STRICT_LIMIT = 0.05;
/** Килокалорий в грамме сахара. */
export const KCAL_PER_SUGAR_G = 4;
/** Граммов сахара в чайной ложке. */
export const SUGAR_TEASPOON_G = 5;

export type SugarLimits = {
  /** До 10% калорийности, г. */
  softG: number;
  /** До 5% калорийности, г. */
  strictG: number;
  softTeaspoons: number;
  strictTeaspoons: number;
};

export function sugarLimits(kcalPerDay: number): SugarLimits {
  const kcal = Math.max(800, Math.min(5000, kcalPerDay));
  const soft = (kcal * SUGAR_SOFT_LIMIT) / KCAL_PER_SUGAR_G;
  const strict = (kcal * SUGAR_STRICT_LIMIT) / KCAL_PER_SUGAR_G;
  return {
    softG: Math.round(soft),
    strictG: Math.round(strict),
    softTeaspoons: Math.round(soft / SUGAR_TEASPOON_G),
    strictTeaspoons: Math.round(strict / SUGAR_TEASPOON_G),
  };
}

export type SugarSource = {
  name: string;
  portion: string;
  /** Добавленного сахара в порции, г. */
  sugarG: number;
};

/** Скрытые и явные источники добавленного сахара. */
export const SUGAR_SOURCES: SugarSource[] = [
  { name: "Газировка", portion: "банка 330 мл", sugarG: 35 },
  { name: "Сок из пакета", portion: "стакан 250 мл", sugarG: 22 },
  { name: "Йогурт с наполнителем", portion: "баночка 125 г", sugarG: 13 },
  { name: "Шоколадный батончик", portion: "50 г", sugarG: 28 },
  { name: "Печенье", portion: "3 шт., 45 г", sugarG: 14 },
  { name: "Кетчуп", portion: "столовая ложка", sugarG: 4 },
  { name: "Мюсли с сахаром", portion: "порция 50 г", sugarG: 10 },
  { name: "Сахар в чай или кофе", portion: "чайная ложка", sugarG: 5 },
  { name: "Мороженое", portion: "100 г", sugarG: 20 },
  { name: "Творожок сладкий", portion: "100 г", sugarG: 14 },
];

export function computeSugar(selected: Record<string, number>, kcalPerDay: number) {
  let total = 0;
  for (const source of SUGAR_SOURCES) {
    total += (selected[source.name] ?? 0) * source.sugarG;
  }
  const limits = sugarLimits(kcalPerDay);
  const grams = Math.round(total);
  return {
    grams,
    teaspoons: Math.round(grams / SUGAR_TEASPOON_G),
    kcal: grams * KCAL_PER_SUGAR_G,
    /** Доля суточной калорийности, %. */
    shareOfKcal: Math.round(((grams * KCAL_PER_SUGAR_G) / Math.max(800, kcalPerDay)) * 1000) / 10,
    limits,
    zone: grams <= limits.strictG ? "strict" : grams <= limits.softG ? "soft" : "above",
  };
}

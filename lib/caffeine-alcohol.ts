/**
 * Кофеин и алкоголь: два вещества, которые люди не считают вовсе.
 *
 * ## Кофеин
 *
 * EFSA: до 400 мг в сутки для взрослого безопасно, разовая доза — до 200 мг.
 * Интереснее другое: период полувыведения кофеина у взрослого — около
 * пяти часов. Отсюда практический ответ на вопрос, который люди задают
 * чаще, чем «сколько можно»: **во сколько последняя чашка перестанет
 * мешать сну**. Считаем, сколько кофеина останется в организме ко сну, и
 * называем время, после которого пить не стоит.
 *
 * Порог «мешает засыпанию» индивидуален; берём 50 мг как ориентир —
 * примерно половина чашки кофе.
 *
 * ## Алкоголь
 *
 * Спирт даёт 7 ккал на грамм — больше, чем углеводы и белок, и почти
 * столько же, сколько жир. Эти калории не учитывает почти никто, а в
 * дневнике они видны сразу. Плюс важное: организм откладывает окисление
 * жиров, пока перерабатывает спирт, — то есть вечер с вином стоит дороже
 * своих калорий.
 */

/** Безопасный суточный потолок кофеина для взрослого, мг (EFSA). */
export const CAFFEINE_DAILY_LIMIT = 400;
/** Безопасная разовая доза, мг. */
export const CAFFEINE_SINGLE_LIMIT = 200;
/** Период полувыведения, часов. */
export const CAFFEINE_HALF_LIFE = 5;
/** Сколько кофеина в организме ко сну уже почти не мешает, мг. */
export const CAFFEINE_SLEEP_THRESHOLD = 50;

export type CaffeineDrink = { name: string; portion: string; mg: number };

export const CAFFEINE_DRINKS: CaffeineDrink[] = [
  { name: "Эспрессо", portion: "30 мл", mg: 63 },
  { name: "Американо", portion: "200 мл", mg: 80 },
  { name: "Капучино", portion: "200 мл", mg: 63 },
  { name: "Фильтр-кофе", portion: "250 мл", mg: 95 },
  { name: "Растворимый кофе", portion: "200 мл", mg: 62 },
  { name: "Чай чёрный", portion: "250 мл", mg: 47 },
  { name: "Чай зелёный", portion: "250 мл", mg: 28 },
  { name: "Матча", portion: "250 мл", mg: 70 },
  { name: "Энергетик", portion: "банка 250 мл", mg: 80 },
  { name: "Кола", portion: "банка 330 мл", mg: 34 },
  { name: "Тёмный шоколад", portion: "50 г", mg: 30 },
];

export type CaffeineResult = {
  totalMg: number;
  /** Доля от суточного потолка, %. */
  shareOfLimit: number;
  zone: "ok" | "near" | "above";
  /** Сколько кофеина останется через столько-то часов, мг. */
  remainingAfter: (hours: number) => number;
};

export function computeCaffeine(selected: Record<string, number>): CaffeineResult {
  let total = 0;
  for (const drink of CAFFEINE_DRINKS) {
    total += (selected[drink.name] ?? 0) * drink.mg;
  }
  const mg = Math.round(total);
  const share = Math.round((mg / CAFFEINE_DAILY_LIMIT) * 100);
  return {
    totalMg: mg,
    shareOfLimit: share,
    zone: share <= 75 ? "ok" : share <= 100 ? "near" : "above",
    remainingAfter: (hours) => Math.round(mg * Math.pow(0.5, hours / CAFFEINE_HALF_LIFE)),
  };
}

/**
 * Во сколько выпить последнюю порцию, чтобы ко сну осталось меньше порога.
 * Возвращает число часов до сна, за которое нужно остановиться.
 */
export function hoursBeforeSleep(doseMg: number): number {
  if (doseMg <= CAFFEINE_SLEEP_THRESHOLD) return 0;
  const halfLives = Math.log(doseMg / CAFFEINE_SLEEP_THRESHOLD) / Math.log(2);
  return Math.round(halfLives * CAFFEINE_HALF_LIFE * 10) / 10;
}

/** Килокалорий в грамме чистого спирта. */
export const KCAL_PER_ALCOHOL_G = 7;
/** Плотность спирта, г/мл. */
const ETHANOL_DENSITY = 0.789;

export type Drink = {
  name: string;
  /** Объём порции, мл. */
  volumeMl: number;
  /** Крепость, % об. */
  abv: number;
  /** Сахар и прочие углеводы в порции, г. */
  carbsG: number;
  portion: string;
};

export const ALCOHOL_DRINKS: Drink[] = [
  { name: "Пиво светлое", volumeMl: 500, abv: 4.5, carbsG: 15, portion: "0,5 л" },
  { name: "Пиво тёмное", volumeMl: 500, abv: 5.5, carbsG: 20, portion: "0,5 л" },
  { name: "Вино сухое красное", volumeMl: 150, abv: 13, carbsG: 1, portion: "бокал 150 мл" },
  { name: "Вино сухое белое", volumeMl: 150, abv: 12, carbsG: 1, portion: "бокал 150 мл" },
  { name: "Вино полусладкое", volumeMl: 150, abv: 12, carbsG: 8, portion: "бокал 150 мл" },
  { name: "Шампанское брют", volumeMl: 125, abv: 12, carbsG: 1, portion: "бокал 125 мл" },
  { name: "Водка", volumeMl: 50, abv: 40, carbsG: 0, portion: "рюмка 50 мл" },
  { name: "Виски", volumeMl: 50, abv: 40, carbsG: 0, portion: "50 мл" },
  { name: "Коньяк", volumeMl: 50, abv: 40, carbsG: 0, portion: "50 мл" },
  { name: "Джин-тоник", volumeMl: 250, abv: 6, carbsG: 18, portion: "стакан 250 мл" },
  { name: "Ликёр", volumeMl: 50, abv: 20, carbsG: 15, portion: "50 мл" },
  { name: "Коктейль с сиропом", volumeMl: 200, abv: 12, carbsG: 25, portion: "200 мл" },
];

/** Калорийность одной порции напитка: спирт плюс углеводы. */
export function drinkKcal(drink: Drink): number {
  const alcoholG = (drink.volumeMl * (drink.abv / 100)) * ETHANOL_DENSITY;
  return Math.round(alcoholG * KCAL_PER_ALCOHOL_G + drink.carbsG * 4);
}

/** Чистого спирта в порции, г — по нему считают дозы, а не по объёму. */
export function drinkAlcoholG(drink: Drink): number {
  return Math.round(drink.volumeMl * (drink.abv / 100) * ETHANOL_DENSITY);
}

export function computeAlcohol(selected: Record<string, number>) {
  let kcal = 0;
  let alcoholG = 0;
  for (const drink of ALCOHOL_DRINKS) {
    const count = selected[drink.name] ?? 0;
    kcal += drinkKcal(drink) * count;
    alcoholG += drinkAlcoholG(drink) * count;
  }
  return {
    kcal: Math.round(kcal),
    alcoholG: Math.round(alcoholG),
    /** Сколько это в порциях по 10 г спирта — единица, принятая в рекомендациях. */
    units: Math.round((alcoholG / 10) * 10) / 10,
  };
}

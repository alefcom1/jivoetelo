/**
 * Сколько граммов в стакане и ложке.
 *
 * ## Почему это отдельные данные, а не household из lib/products
 *
 * В `lib/products.ts` бытовые меры описывают **порцию готового продукта**:
 * «стакан кефира», «ломтик хлеба». Здесь другое — сыпучие и жидкие
 * продукты в кухонной посуде, то есть вопрос «сколько грамм муки в
 * стакане», который задают при готовке, а не при подсчёте съеденного.
 * Смешать их в одну таблицу значило бы получить «стакан гречки» с двумя
 * разными числами: сухой и отварной.
 *
 * ## Чей стакан
 *
 * Гранёный стакан: 250 мл до краёв и 200 мл до ободка («до риски»). В
 * рецептах советской школы «стакан» — это 200 мл, и путаница между двумя
 * стаканами даёт четверть веса. Поэтому в таблице обе колонки, а не одна.
 *
 * Ложки — без горки, вровень с краями: «с горкой» у разных людей отличается
 * в полтора раза, и обещать точность там нельзя. Об этом сказано на
 * странице прямым текстом.
 *
 * Числа — типовые значения кулинарных таблиц мер и весов; порядок величин
 * сверяется тестом с плотностью (`tests/kitchen-measures.test.mjs`).
 */

export type MeasureRow = {
  name: string;
  /** Гранёный стакан до краёв, 250 мл. */
  glass250: number;
  /** Гранёный стакан до ободка, 200 мл. */
  glass200: number;
  /** Столовая ложка без горки. */
  tablespoon: number;
  /** Чайная ложка без горки. */
  teaspoon: number;
  /** Категория для группировки в таблице. */
  group: "Крупы и мука" | "Сахар и соль" | "Жидкости и масла" | "Молочное" | "Прочее";
  /** Заметка о том, что двигает вес именно у этого продукта. */
  note?: string;
};

export const MEASURES: MeasureRow[] = [
  // Крупы и мука
  { name: "Мука пшеничная", glass250: 160, glass200: 130, tablespoon: 25, teaspoon: 8, group: "Крупы и мука",
    note: "Просеянная мука легче непросеянной примерно на десятую часть — насыпайте одинаково." },
  { name: "Гречка (сухая)", glass250: 210, glass200: 165, tablespoon: 25, teaspoon: 8, group: "Крупы и мука" },
  { name: "Рис (сухой)", glass250: 230, glass200: 180, tablespoon: 25, teaspoon: 8, group: "Крупы и мука" },
  { name: "Овсяные хлопья", glass250: 100, glass200: 80, tablespoon: 12, teaspoon: 4, group: "Крупы и мука",
    note: "Хлопья быстрого приготовления легче геркулеса: разница до четверти веса." },
  { name: "Манная крупа", glass250: 200, glass200: 160, tablespoon: 25, teaspoon: 8, group: "Крупы и мука" },
  { name: "Пшено (сухое)", glass250: 220, glass200: 175, tablespoon: 25, teaspoon: 8, group: "Крупы и мука" },
  { name: "Перловка (сухая)", glass250: 230, glass200: 185, tablespoon: 25, teaspoon: 8, group: "Крупы и мука" },
  { name: "Крахмал картофельный", glass250: 160, glass200: 130, tablespoon: 30, teaspoon: 10, group: "Крупы и мука" },
  { name: "Панировочные сухари", glass250: 125, glass200: 100, tablespoon: 15, teaspoon: 5, group: "Крупы и мука" },

  // Сахар и соль
  { name: "Сахар-песок", glass250: 200, glass200: 160, tablespoon: 25, teaspoon: 8, group: "Сахар и соль" },
  { name: "Сахарная пудра", glass250: 180, glass200: 140, tablespoon: 20, teaspoon: 7, group: "Сахар и соль" },
  { name: "Соль поваренная", glass250: 320, glass200: 255, tablespoon: 30, teaspoon: 10, group: "Сахар и соль",
    note: "Крупная морская соль легче мелкой примерно на пятую часть при том же объёме." },
  { name: "Мёд", glass250: 325, glass200: 260, tablespoon: 30, teaspoon: 10, group: "Сахар и соль" },
  { name: "Сода пищевая", glass250: 250, glass200: 200, tablespoon: 28, teaspoon: 9, group: "Сахар и соль" },
  { name: "Какао-порошок", glass250: 150, glass200: 120, tablespoon: 15, teaspoon: 5, group: "Сахар и соль" },

  // Жидкости и масла
  { name: "Вода", glass250: 250, glass200: 200, tablespoon: 15, teaspoon: 5, group: "Жидкости и масла" },
  { name: "Масло растительное", glass250: 230, glass200: 185, tablespoon: 17, teaspoon: 6, group: "Жидкости и масла",
    note: "Столовая ложка масла — около 150 ккал: самая дорогая ошибка «на глазок» на всей кухне." },
  { name: "Масло сливочное (растопленное)", glass250: 240, glass200: 190, tablespoon: 17, teaspoon: 6, group: "Жидкости и масла" },
  { name: "Уксус", glass250: 250, glass200: 200, tablespoon: 15, teaspoon: 5, group: "Жидкости и масла" },
  { name: "Соевый соус", glass250: 265, glass200: 210, tablespoon: 16, teaspoon: 5, group: "Жидкости и масла" },

  // Молочное
  { name: "Молоко", glass250: 255, glass200: 205, tablespoon: 15, teaspoon: 5, group: "Молочное" },
  { name: "Кефир", glass250: 255, glass200: 205, tablespoon: 15, teaspoon: 5, group: "Молочное" },
  { name: "Сметана", glass250: 250, glass200: 200, tablespoon: 25, teaspoon: 8, group: "Молочное" },
  { name: "Творог", glass250: 250, glass200: 200, tablespoon: 30, teaspoon: 10, group: "Молочное" },
  { name: "Сгущённое молоко", glass250: 300, glass200: 240, tablespoon: 30, teaspoon: 10, group: "Молочное" },

  // Прочее
  { name: "Арахисовая паста", glass250: 260, glass200: 210, tablespoon: 32, teaspoon: 11, group: "Прочее",
    note: "Ложка пасты — около 190 ккал. Меряйте её ложкой, а не «сколько зачерпнулось»." },
  { name: "Томатная паста", glass250: 280, glass200: 225, tablespoon: 30, teaspoon: 10, group: "Прочее" },
  { name: "Изюм", glass250: 190, glass200: 155, tablespoon: 25, teaspoon: 8, group: "Прочее" },
  { name: "Орехи очищенные (среднее)", glass250: 150, glass200: 120, tablespoon: 20, teaspoon: 7, group: "Прочее" },
  { name: "Семена подсолнечника", glass250: 170, glass200: 135, tablespoon: 18, teaspoon: 6, group: "Прочее" },
];

export const MEASURE_GROUPS = [
  "Крупы и мука",
  "Сахар и соль",
  "Жидкости и масла",
  "Молочное",
  "Прочее",
] as const;

export function findMeasure(name: string): MeasureRow | undefined {
  return MEASURES.find((row) => row.name === name);
}

export type MeasureKey = "glass250" | "glass200" | "tablespoon" | "teaspoon";

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  glass250: "стакан 250 мл",
  glass200: "стакан 200 мл",
  tablespoon: "столовая ложка",
  teaspoon: "чайная ложка",
};

/** Вес набора мер: сколько граммов даст столько-то ложек и стаканов. */
export function weighMeasures(row: MeasureRow, counts: Partial<Record<MeasureKey, number>>): number {
  let grams = 0;
  for (const key of Object.keys(MEASURE_LABELS) as MeasureKey[]) {
    grams += (counts[key] ?? 0) * row[key];
  }
  return Math.round(grams);
}

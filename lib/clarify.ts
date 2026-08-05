/**
 * Применение ответа на уточняющий вопрос к списку позиций.
 *
 * ## Из-за чего появился этот модуль
 *
 * Уточнение умело только добавлять. На вопрос «какой йогурт?» с вариантами
 * «обычный» и «греческий» выбор греческого **дописывал** его к списку, а
 * исходный «Йогурт» оставался на месте — в приёме пищи оказывалось два
 * йогурта, и калорийность дня удваивалась на ровном месте. То же случалось
 * с любым вопросом, который не добавляет ингредиент, а уточняет уже
 * найденный.
 *
 * Причина была не в опечатке, а в модели данных: у варианта ответа есть
 * только `addItem`, и никакого способа сказать «замени вторую позицию» не
 * существовало. Поэтому появилось поле `refinesIndex` у самого вопроса.
 *
 * ## Почему одного поля мало
 *
 * `refinesIndex` заполняет модель, а модель может его и не поставить —
 * старые разборы, лежащие в инбоксе, его точно не содержат. Поэтому здесь же
 * работает запасное правило по названию: если добавляемая позиция — это
 * уточнение уже имеющейся («Йогурт» → «Йогурт греческий»), она её заменяет,
 * а не дублирует.
 *
 * Правило нарочно узкое: совпадать должно **начало** названия и по границе
 * слова. «Йогурт» → «Йогурт греческий» заменяет, а «Масло оливковое» рядом с
 * «Масло сливочное» — нет, потому что ни одно не начинается с другого.
 */

/** Минимум, который нужен для решения; у вкладок свои полные типы позиции. */
export type NamedItem = { name: string };

export type ClarifyOption<I> = { label: string; addItem?: I };
export type ClarifyQuestion<I> = {
  question: string;
  options: ClarifyOption<I>[];
  /** Номер позиции, которую этот вопрос уточняет. */
  refinesIndex?: number;
};

/** Нормализуем для сравнения: регистр и ё — не различие по существу. */
function norm(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").trim();
}

/**
 * Какую позицию заменяет добавляемая, если заменяет.
 *
 * Возвращает индекс или −1. Экспортируется ради теста: правило здесь
 * важнее, чем то, как оно вызывается.
 */
export function refinedIndex<I extends NamedItem>(items: readonly I[], added: I): number {
  const target = norm(added.name);
  let best = -1;
  let bestLength = 0;

  for (let i = 0; i < items.length; i += 1) {
    const existing = norm(items[i].name);
    if (existing === target) return i; // точное совпадение — точно замена
    // Уточнение начинается с исходного названия и продолжается новым словом:
    // «йогурт» → «йогурт греческий». Проверка границы слова обязательна,
    // иначе «сок» совпал бы с «сокол».
    if (target.startsWith(`${existing} `) && existing.length > bestLength) {
      best = i;
      bestLength = existing.length;
    }
  }
  return best;
}

/**
 * Новый список позиций после выбора варианта.
 *
 * Вариант без `addItem` («без заправки», «ничего из этого») ничего не
 * меняет — вопрос просто снимается вызывающим кодом.
 */
export function applyClarification<I extends NamedItem>(
  items: readonly I[],
  question: ClarifyQuestion<I>,
  optionIndex: number,
): I[] {
  const option = question.options[optionIndex];
  if (!option?.addItem) return [...items];
  const added = option.addItem;

  // Явное указание модели важнее догадки по названию — но только если индекс
  // существует: за пределами списка он означал бы потерю позиции.
  const explicit = question.refinesIndex;
  const target =
    typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 0 && explicit < items.length
      ? explicit
      : refinedIndex(items, added);

  if (target < 0) return [...items, added];
  return items.map((item, i) => (i === target ? added : item));
}

/**
 * Штрихкоды: разбор, проверка и нормализация. Чистый модуль без базы —
 * проверяется тестами напрямую и годится и серверу, и клиенту.
 *
 * ## Зачем вообще проверять контрольную цифру
 *
 * Сканер ошибается. Плохой свет, блик на плёнке, смятая пачка — и вместо
 * 4600682003014 приходит 4600682003015. Контрольная цифра ловит ровно этот
 * случай: она вычисляется из остальных, и подменённая цифра её ломает.
 *
 * Без проверки такой код ушёл бы в базу как новый товар — и человек завёл бы
 * карточку «Молоко 3,2%» на несуществующий штрихкод, которую больше никогда
 * не найдёт. Один раз пропущенная опечатка живёт в базе вечно.
 */

/** Форматы, которые мы принимаем. UPC-A хранится как EAN-13 с нулём впереди. */
export type BarcodeFormat = "ean_13" | "ean_8";

const DIGITS_ONLY = /^\d+$/;

/**
 * Контрольная цифра EAN: сумма цифр с чередующимися весами, дополненная до
 * десятка. Веса идут справа налево (3, 1, 3, 1…) — это одно правило и для
 * восьмизначного кода, и для тринадцатизначного, поэтому здесь одна функция,
 * а не две почти одинаковые.
 */
function eanCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  // Справа налево: крайняя правая из значащих цифр всегда имеет вес 3.
  for (let i = digitsWithoutCheck.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Приводит код к каноническому виду или возвращает null.
 *
 * UPC-A (12 цифр) дополняется нулём слева: это тот же код в системе EAN, и
 * хранить его двумя записями значило бы не находить американский товар,
 * отсканированный «не тем» способом.
 *
 * Пробелы и дефисы срезаются: их дописывают руками, читая с упаковки.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!DIGITS_ONLY.test(digits)) return null;

  const code = digits.length === 12 ? `0${digits}` : digits;
  if (code.length !== 13 && code.length !== 8) return null;

  const body = code.slice(0, -1);
  if (eanCheckDigit(body) !== Number(code[code.length - 1])) return null;
  return code;
}

export function isValidBarcode(raw: string): boolean {
  return normalizeBarcode(raw) !== null;
}

export function barcodeFormat(code: string): BarcodeFormat | null {
  const normalized = normalizeBarcode(code);
  if (!normalized) return null;
  return normalized.length === 8 ? "ean_8" : "ean_13";
}

/**
 * Префиксы GS1, выданные России и странам ЕАЭС.
 *
 * Нужны не для проверки — код с любым префиксом одинаково валиден, — а для
 * честного объяснения. «Такого товара у нас нет» после сканирования
 * импортной банки и после сканирования российской пачки означает разное: в
 * первом случае его, скорее всего, и не будет, во втором он появится, как
 * только кто-нибудь его заведёт. Люди заполняют базу охотнее, когда понимают,
 * что заполняют.
 */
const EAEU_PREFIXES: Array<[number, number, string]> = [
  [460, 469, "Россия"],
  [481, 481, "Беларусь"],
  [482, 482, "Украина"],
  [483, 483, "Туркменистан"],
  [484, 484, "Молдова"],
  [485, 485, "Армения"],
  [486, 486, "Грузия"],
  [487, 487, "Казахстан"],
  [488, 488, "Таджикистан"],
  [489, 489, "Гонконг"],
];

/**
 * Страна регистрации по префиксу — или null, если это не EAEU-код.
 *
 * Важная оговорка: префикс говорит, где зарегистрирован владелец кода, а не
 * где сделан товар. Писать «произведено в России» по этому числу нельзя.
 */
export function barcodeRegion(code: string): string | null {
  const normalized = normalizeBarcode(code);
  // Восьмизначные коды короткие и префиксом страну не определяют.
  if (!normalized || normalized.length !== 13) return null;
  const prefix = Number(normalized.slice(0, 3));
  for (const [from, to, country] of EAEU_PREFIXES) {
    if (prefix >= from && prefix <= to) return country;
  }
  return null;
}

/**
 * Внутренний код магазина (префиксы 20–29): весовой товар, напечатанный на
 * месте. В таком коде «штрихкод» — это не товар, а цена и вес конкретной
 * упаковки, и одна и та же цифра завтра будет означать другое.
 *
 * Заводить такие в общую базу нельзя: они не переносятся ни между магазинами,
 * ни между днями, и человек, отсканировавший вчерашнюю нарезку, получил бы
 * чужой продукт с полной уверенностью в правильности.
 */
export function isStoreInternal(code: string): boolean {
  const normalized = normalizeBarcode(code);
  if (!normalized || normalized.length !== 13) return false;
  const prefix = Number(normalized.slice(0, 2));
  return prefix >= 20 && prefix <= 29;
}

/** Код в удобочитаемом виде: 4 600682 003014 — как напечатано на упаковке. */
export function formatBarcode(code: string): string {
  const normalized = normalizeBarcode(code);
  if (!normalized) return code;
  if (normalized.length === 8) return `${normalized.slice(0, 4)} ${normalized.slice(4)}`;
  return `${normalized.slice(0, 1)} ${normalized.slice(1, 7)} ${normalized.slice(7)}`;
}

/** Порция по умолчанию, когда вес пачки неизвестен. */
export const DEFAULT_PORTION_G = 100;

/**
 * Карточка товара. Тип живёт в чистом модуле, а не рядом с запросами в базу
 * (lib/barcode-store.ts): его импортирует клиентский компонент сканера, и
 * тащить ради типа в браузерный бандл драйвер PostgreSQL незачем.
 */
export type BarcodeProduct = {
  code: string;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  /** Вес пачки; 0 — не знаем, подставляем DEFAULT_PORTION_G. */
  portionG: number;
  confirmations: number;
};

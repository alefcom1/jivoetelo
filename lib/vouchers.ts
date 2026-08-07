/**
 * Ваучеры: код на бесплатный доступ.
 *
 * Модуль чистый — база в lib/vouchers-store.ts. Разделение здесь важнее
 * обычного: ваучер это деньги, и правила разбора кода должны проверяться
 * тестами напрямую, а не через живой прогон.
 *
 * ## Почему код не такой, как реферальный
 *
 * Реферальный код живёт внутри ссылки: его никто не читает и не набирает.
 * Ваучер человек получает от нас — из письма, с открытки, от блогера — и
 * вбивает руками, иногда переписывая с экрана или диктуя по телефону.
 * Отсюда всё остальное: алфавит без похожих начертаний, группы по четыре и
 * разбор, который прощает регистр, дефисы и пробелы.
 */

/** Тот же алфавит, что у реферальных кодов: без 0/O и 1/l/I. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Символов в коде, без разделителя. Восемь — это 31^8 ≈ 8,5·10^11. */
export const CODE_LENGTH = 8;

/**
 * Верхний регистр, а не строчный, — в отличие от реферального.
 *
 * Ваучер печатают на открытках и показывают на экране; заглавные читаются
 * с расстояния лучше и не путаются с окружающим текстом. Набирает человек
 * как хочет: `normalizeCode` приводит что угодно к одному виду.
 */
export function makeVoucherCode(random: () => number = cryptoRandom): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}

/**
 * Привести введённое к каноническому виду.
 *
 * Прощаем всё, что человек делает не по злому умыслу: строчные буквы,
 * дефисы из нашего же оформления, пробелы из буфера обмена, неразрывный
 * пробел из вставки, кириллические двойники латинских букв. Последнее —
 * не мелочь: «С», «Р», «А» с русской раскладки выглядят ровно как латинские,
 * и человек, набравший код не переключившись, ничего не заподозрит.
 *
 * `null` — код непохож на наш, в базу с ним ходить незачем.
 */
export function normalizeCode(raw: string): string | null {
  const cyrillicToLatin: Record<string, string> = {
    А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X",
  };
  const cleaned = [...raw.trim().toUpperCase()]
    .map((char) => cyrillicToLatin[char] ?? char)
    .filter((char) => char !== "-" && char !== " " && char !== " ")
    .join("");

  if (cleaned.length !== CODE_LENGTH) return null;
  if (![...cleaned].every((char) => ALPHABET.includes(char))) return null;
  return cleaned;
}

/** Показать код человеку: две группы по четыре. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export type VoucherState = {
  /** Кем погашен, если погашен. */
  usedBy: number | null;
  /** До какого момента код можно погасить. `null` — бессрочно. */
  expiresAt: Date | null;
};

export type VoucherVerdict =
  | { ok: true }
  | { ok: false; reason: "used" | "expired"; message: string };

/**
 * Можно ли погасить этот ваучер.
 *
 * Причины разведены намеренно: «уже использован» и «срок вышел» — разные
 * новости для человека. Первое чаще всего значит, что кодом поделились, и
 * тогда просить второй бессмысленно; второе — что код просто старый, и
 * второй попросить как раз можно.
 */
export function checkVoucher(state: VoucherState, now: Date): VoucherVerdict {
  if (state.usedBy !== null) {
    return { ok: false, reason: "used", message: "Этот код уже использован." };
  }
  if (state.expiresAt !== null && state.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired", message: "Срок действия кода истёк." };
  }
  return { ok: true };
}

/** Текст, когда кода нет вовсе. Отдельно: он не должен намекать на формат. */
export const UNKNOWN_CODE_MESSAGE = "Такого кода нет. Проверьте, не потерялся ли символ.";

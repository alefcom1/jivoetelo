/**
 * Приглашения: код, ссылка и разбор того, что пришло обратно.
 *
 * Модуль чистый — база в lib/referral-store.ts. Это позволяет проверять
 * разбор `start`-параметра тестами: именно он приходит снаружи, от Telegram,
 * и именно он не должен уметь ничего, кроме как назвать пригласившего.
 */

import { botLink } from "./bot-public.ts";

/**
 * Префикс в `start`-параметре: `t.me/<бот>?start=ref_<код>`.
 *
 * Отдельный от обычных меток (START_PAYLOADS) префикс нужен потому, что
 * метки — это закрытый список из трёх слов, а код приглашения — произвольная
 * строка. Без префикса бот не отличил бы одно от другого и однажды принял бы
 * код за метку или наоборот.
 */
export const REFERRAL_PREFIX = "ref_";

/**
 * Длина кода. Восемь символов алфавита из 32 — это 32^8 ≈ 10^12 вариантов:
 * перебором ссылку не найти, а сама она остаётся достаточно короткой, чтобы
 * не пугать в сообщении.
 */
export const CODE_LENGTH = 8;

/**
 * Алфавит без похожих начертаний: нет 0/O, 1/I/l. Код читают с экрана и
 * иногда диктуют, и «ноль или буква O» — единственная ошибка, которую здесь
 * реально совершают.
 */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Сгенерировать код. `random` — для тестов; в бою это crypto. */
export function makeReferralCode(random: () => number = cryptoRandom): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

function cryptoRandom(): number {
  // Веб-крипто есть и в Node 22, и в браузере; Math.random для ссылки,
  // которая должна быть неугадываемой, не годится.
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 2 ** 32;
}

/** Код похож на наш? Проверка до похода в базу. */
export function isReferralCode(value: unknown): value is string {
  return typeof value === "string"
    && value.length === CODE_LENGTH
    && [...value].every((char) => ALPHABET.includes(char));
}

/** Ссылка-приглашение. */
export function referralLink(code: string): string {
  return botLink(`${REFERRAL_PREFIX}${code}`);
}

/**
 * Вытащить код из `start`-параметра. `null` для всего остального, включая
 * обычные метки: снаружи сюда приходит что угодно.
 */
export function referralFromStart(start: string | null | undefined): string | null {
  if (typeof start !== "string" || !start.startsWith(REFERRAL_PREFIX)) return null;
  const code = start.slice(REFERRAL_PREFIX.length);
  return isReferralCode(code) ? code : null;
}

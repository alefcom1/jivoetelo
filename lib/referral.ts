/**
 * Реферальные ссылки: `https://t.me/jivelo_bot?start=ref_K7M2QX`.
 *
 * Механика диплинков уже была — метки `plan`, `web`, `site` говорят боту,
 * откуда человек пришёл (lib/bot-public.ts). Реферальная ссылка устроена так
 * же, только вместо места в ней стоит код пригласившего.
 *
 * ## Чего здесь нет и почему
 *
 * Наград. Обещать скидку до того, как появился платный тариф, — обещать то,
 * чем мы не распоряжаемся, а «бонусные разборы» превратили бы приглашение
 * друзей в способ обойти дневной лимит. Пока ссылка только считает: человек
 * видит, сколько людей пришло по ней. Когда тариф появится, награду можно
 * привязать к этому же счётчику, ничего не переделывая.
 *
 * ## Алфавит кода
 *
 * Без нуля, буквы O, единицы, I и L: код читают с чужого экрана и
 * пересказывают голосом, и «0» против «O» здесь стоит потерянного человека.
 * Шесть знаков из тридцати одного — около 900 миллионов вариантов; при
 * коллизии генератор просто пробует ещё раз.
 *
 * Модуль чистый: работа с базой — в lib/referral-store.ts. Разбор ссылки и
 * форма кода проверяются тестами без Postgres.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 6;

/** Префикс в диплинке. Telegram разрешает в payload буквы, цифры, `_` и `-`. */
const PREFIX = "ref_";

const CODE_RE = new RegExp(`^[${ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

/**
 * Новый код. `random` передаётся аргументом, чтобы тест мог проверить форму
 * и алфавит, не полагаясь на удачу.
 */
export function generateReferralCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return code;
}

export function isReferralCode(value: string): boolean {
  return CODE_RE.test(value);
}

/**
 * Достаёт код из payload диплинка. `null` — «это не реферальная ссылка», и
 * вызывающий идёт дальше своими ветками.
 *
 * Регистр не важен: `/start` в боте приводит payload к верхнему, а человек
 * мог переслать ссылку как угодно.
 */
export function parseReferralPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (trimmed.length !== PREFIX.length + REFERRAL_CODE_LENGTH) return null;
  if (trimmed.slice(0, PREFIX.length).toLowerCase() !== PREFIX) return null;

  const code = trimmed.slice(PREFIX.length).toUpperCase();
  return isReferralCode(code) ? code : null;
}

/** Payload для ссылки: `ref_K7M2QX`. */
export function referralPayload(code: string): string {
  return `${PREFIX}${code}`;
}

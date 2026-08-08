/**
 * Проверка того, что специалист вводит о себе при регистрации.
 *
 * Модуль чистый — ни базы, ни сессии, — потому что здесь проверяется имя,
 * которое **увидит клиент** на экране согласия. Это единственное поле раздела,
 * которое один человек показывает другому, и правила для него должны быть
 * проверяемы тестом, а не разбросаны по форме.
 *
 * ## Что здесь проверяется и почему именно это
 *
 * Регистрация стала самостоятельной, и вместе с ней появился риск, которого
 * при ручном заведении не было: имя больше никто не читает глазами до того,
 * как его увидит клиент. Отсюда три запрета, каждый — про конкретный способ
 * обмануть человека, а не про «плохие слова»:
 *
 * 1. **Не выдавать себя за сервис.** «Живое Тело», «поддержка», «модерация» в
 *    имени специалиста — прямая дорога к тому, что клиент откроет дневник,
 *    думая, что говорит с нами.
 * 2. **Не притворяться проверенным.** «Официальный», «сертифицирован
 *    сервисом», галочки и звёздочки в имени изображают отметку, которую
 *    сервис ставит сам и по-другому.
 * 3. **Не быть кричалкой.** Адрес, ссылка, телефон, ВСЕ ЗАГЛАВНЫЕ — это уже
 *    не имя, а объявление, и место ему не на экране согласия.
 *
 * Проверить, что человек действительно нутрициолог, отсюда невозможно, и
 * делать вид, что мы это проверили, нельзя. Поэтому клиенту показывается
 * прямо: имя специалист указал сам. Отметка «проверен» появляется отдельно,
 * после того как заявку посмотрел человек.
 */

export type SignupInput = {
  displayName?: string | null;
  specialization?: string | null;
  city?: string | null;
  about?: string | null;
  consent?: boolean;
};

export type SignupResult =
  | {
      ok: true;
      value: { displayName: string; specialization: string | null; city: string | null; about: string | null };
    }
  | { ok: false; error: SignupError; message: string };

export type SignupError = "no_name" | "short_name" | "reserved_name" | "shouty_name" | "no_consent";

/** Слова, которыми специалист выдавал бы себя за сервис или за проверенного. */
const RESERVED = [
  "живое тело",
  "живоетело",
  "jivoetelo",
  "поддержка",
  "служба поддержки",
  "модерац",
  "администрац",
  "официальн",
  "верифиц",
  "сертифицирован сервис",
];

/** Что делает строку объявлением, а не именем. */
const SHOUTY = [
  /https?:\/\//i,
  /\bt\.me\b/i,
  /@[a-z0-9_]{3,}/i,
  /\+?\d[\d\s()-]{8,}/,
  /[✓✔★☆®™]/,
];

export const NAME_MAX = 60;
export const ABOUT_MAX = 500;

export function validateSignup(input: SignupInput): SignupResult {
  const displayName = (input.displayName ?? "").trim().replace(/\s+/g, " ").slice(0, NAME_MAX);

  if (!displayName) {
    return { ok: false, error: "no_name", message: "Как вас зовут? Это имя увидит клиент." };
  }
  if (displayName.length < 2) {
    return { ok: false, error: "short_name", message: "Имя слишком короткое — клиент по нему вас не узнает." };
  }

  const lower = displayName.toLowerCase();
  if (RESERVED.some((word) => lower.includes(word))) {
    return {
      ok: false,
      error: "reserved_name",
      message:
        "В имени нельзя использовать название сервиса и слова вроде «официальный» или «поддержка»: клиент решит, что говорит с нами.",
    };
  }

  // Заглавные считаем по буквам, а не по всей строке: «М. И. Петрова» — это
  // не крик, а «НУТРИЦИОЛОГ АННА» — крик. Порог по доле, а не по факту
  // наличия: аббревиатура внутри имени законна.
  const letters = displayName.replace(/[^\p{L}]/gu, "");
  const upper = displayName.replace(/[^\p{Lu}]/gu, "");
  const shouting = letters.length >= 6 && upper.length / letters.length > 0.7;
  if (shouting || SHOUTY.some((pattern) => pattern.test(displayName))) {
    return {
      ok: false,
      error: "shouty_name",
      message: "Здесь нужно имя, а не объявление: без ссылок, телефонов, значков и слов заглавными.",
    };
  }

  // Согласие проверяем явно и без умолчаний — как в анкете: браузер может
  // быть скомпрометирован, и молчанию мы не доверяем.
  if (!input.consent) {
    return { ok: false, error: "no_consent", message: "Без согласия с условиями кабинет открыть нельзя." };
  }

  const trim = (value: string | null | undefined, max: number) => {
    const text = (value ?? "").trim().slice(0, max);
    return text.length > 0 ? text : null;
  };

  return {
    ok: true,
    value: {
      displayName,
      specialization: trim(input.specialization, 100),
      city: trim(input.city, 100),
      about: trim(input.about, ABOUT_MAX),
    },
  };
}

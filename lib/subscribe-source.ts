/**
 * Источник подписки на почтовую серию: какой калькулятор или какая страница
 * блюда показала форму. Модуль чистый — ни базы, ни SMTP — сознательно
 * отдельно от lib/email-subscribe.ts: проверка источника нужна в server
 * action ещё до похода в БД, а заодно так её можно протестировать напрямую,
 * без alias-путей вида "@/db", которые node --test не резолвит вне сборки
 * Next.js (см. tests/subscribe-source.test.mjs).
 */

import { findDish } from "./dishes.ts";

/**
 * Источники-калькуляторы: форма стоит на фиксированной странице, и источник —
 * тоже фиксированная строка. Список растёт вместе с разделом «Расчёты».
 */
export const CALCULATOR_SOURCES = ["raschet_energiya", "raschet_belok", "raschet_temp", "raschet_kviz"] as const;
export type CalculatorSource = (typeof CALCULATOR_SOURCES)[number];

/**
 * Источник страницы блюда — не константа, а префикс плюс слаг: блюд сотни, и
 * заводить под каждое отдельную строку в CALCULATOR_SOURCES бессмысленно.
 * Слаг после двоеточия и даёт ту самую видимость «какая страница приносит
 * подписки» — но на уровне source, без отдельного столбца под аналитику.
 */
export const DISH_SOURCE_PREFIX = "skolko_kalorij:";

export type SubscribeSource = CalculatorSource | `${typeof DISH_SOURCE_PREFIX}${string}`;

/** Источник для конкретной страницы блюда — используется формой на /skolko-kalorij/[dish]. */
export function dishSubscribeSource(slug: string): SubscribeSource {
  return `${DISH_SOURCE_PREFIX}${slug}`;
}

/**
 * Источник приходит скрытым полем формы, то есть от клиента, — доверять
 * произвольной строке нельзя. Калькулятор обязан быть из фиксированного
 * списка, а блюдо — существовать на самом деле: без этой проверки после
 * двоеточия в базу попало бы что угодно.
 */
export function isKnownSubscribeSource(value: string): value is SubscribeSource {
  if ((CALCULATOR_SOURCES as readonly string[]).includes(value)) return true;
  if (!value.startsWith(DISH_SOURCE_PREFIX)) return false;
  return findDish(value.slice(DISH_SOURCE_PREFIX.length)) !== undefined;
}

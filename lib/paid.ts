/**
 * Платный доступ: тарифы и срок.
 *
 * ## Одно поле вместо трёх состояний
 *
 * Доступ хранится сроком — `users.access_until`, — а не флагом и не строкой
 * тарифа. Причина в том, что источников у доступа два (оплата и ваучер) и
 * будет больше, а вопрос к ним всегда один: открыт ли доступ прямо сейчас.
 * Флаг «premium: да» пришлось бы снимать по расписанию, и первый же
 * упавший cron оставил бы людям доступ, за который никто не платил, — или,
 * что хуже, снял бы его у тех, кто заплатил.
 *
 * Поэтому `plan` вычисляется из срока при каждом чтении пользователя, а не
 * хранится согласованным с ним. Рассогласовать нечего.
 *
 * ## Что даёт платный доступ
 *
 * Только более высокие дневные лимиты распознавания (PLAN_LIMITS в
 * lib/quota-policy.ts). Ни одна возможность, доступная бесплатно, платной не
 * становится: люди уже пользуются сервисом, и отобрать отданное — худший
 * способ начать брать деньги. Это правило проверяется тестом на самих
 * лимитах: премиум обязан быть не уже бесплатного.
 */

import type { Plan } from "./quota-policy.ts";

export type TariffKey = "month" | "year";

export type Tariff = {
  key: TariffKey;
  label: string;
  /** На сколько дней продлевает доступ. */
  days: number;
  /** Цена в рублях, целыми. */
  priceRub: number;
};

/**
 * Тарифы. Год дешевле десяти месяцев — это не скидка ради скидки: годовая
 * оплата снимает ежемесячное решение «продлевать ли», а оно у сервиса про
 * привычку стоит дороже разницы в деньгах.
 */
export const TARIFFS: readonly Tariff[] = [
  { key: "month", label: "Месяц", days: 30, priceRub: 190 },
  { key: "year", label: "Год", days: 365, priceRub: 1900 },
];

export function tariffByKey(key: string): Tariff | null {
  return TARIFFS.find((tariff) => tariff.key === key) ?? null;
}

/** Открыт ли платный доступ прямо сейчас. */
export function hasPaidAccess(accessUntil: Date | null, now: Date): boolean {
  return accessUntil !== null && accessUntil.getTime() > now.getTime();
}

/** Тариф, действующий сейчас. Вычисляется, а не хранится. */
export function effectivePlan(accessUntil: Date | null, now: Date): Plan {
  return hasPaidAccess(accessUntil, now) ? "premium" : "free";
}

/**
 * Продлить доступ на `days` дней.
 *
 * Отсчёт идёт от большего из «сейчас» и «текущего срока»: у того, кто
 * продлевает заранее, остаток не должен сгорать. Обратное поведение —
 * «продлил за неделю до конца и потерял неделю» — читается как обман, и
 * человек начинает тянуть до последнего дня.
 */
export function extendAccess(accessUntil: Date | null, days: number, now: Date): Date {
  const from = accessUntil && accessUntil.getTime() > now.getTime() ? accessUntil : now;
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * Сколько дней осталось, округляя вверх.
 *
 * Вверх, потому что «осталось 0 дней» при доступе до вечера — неправда.
 * Ноль здесь означает, что доступа уже нет.
 */
export function daysLeft(accessUntil: Date | null, now: Date): number {
  if (!hasPaidAccess(accessUntil, now)) return 0;
  return Math.ceil((accessUntil!.getTime() - now.getTime()) / 86_400_000);
}

/** Цена строкой: «190 ₽». Неразрывный пробел — число и знак не разрываются. */
export function priceRub(value: number): string {
  return `${value} ₽`;
}

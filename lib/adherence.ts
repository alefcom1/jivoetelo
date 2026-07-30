// Приверженность дневнику по дням недели (экран «План», Mini App v2).
//
// Это не оценка поведения, а факт: сколько раз за последние недели человек
// вёл записи в каждый конкретный день недели. Помогает заметить свой паттерн
// («по пятницам обычно не до записей») — без осуждения, поэтому здесь нет
// ни цвета «плохо/хорошо», ни текста вроде «вы пропустили». Просто числа.

import { shiftDay } from "./dates.ts";

export type AdherenceDay = {
  /** 0 — понедельник, 6 — воскресенье (в отличие от Date#getDay(), где 0 — воскресенье). */
  weekday: number;
  label: string;
  loggedCount: number;
  totalCount: number;
};

export type AdherenceResult = {
  /** Всегда 7 элементов, начиная с понедельника — порядок фиксирован для отрисовки. */
  days: AdherenceDay[];
  totalLoggedDays: number;
  /** Сколько дней вообще попало в окно наблюдения. */
  totalDays: number;
  /** Первый день окна — самый ранний из (earliestDay, today - maxWindowDays + 1). */
  windowStart: string;
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Понедельник = 0 … воскресенье = 6. */
function mondayIndex(day: string): number {
  const jsWeekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = воскресенье
  return (jsWeekday + 6) % 7;
}

/**
 * Раскладывает дни с записями по дням недели за окно наблюдения.
 *
 * Окно — это `maxWindowDays` дней, заканчивающихся сегодня, но не длиннее,
 * чем сам аккаунт: `earliestDay` не даёт окну зайти в прошлое до того, как
 * человек вообще начал пользоваться сервисом — иначе новому пользователю
 * показали бы «Пн: 0 из 8», хотя восьми понедельников с ним ещё не было.
 *
 * `loggedDays` — даты (YYYY-MM-DD) любых дней, где есть хоть одна запись
 * (обычно приём пищи); дубликаты не важны, здесь используется только факт.
 * `today` передаётся аргументом, а не берётся из `new Date()` — тот же
 * принцип, что и в lib/reminders.ts: поведение должно проверяться тестами на
 * фиксированной дате, а не подстраиваться под момент запуска.
 */
export function computeAdherence(
  loggedDays: string[],
  today: string,
  earliestDay: string,
  maxWindowDays = 56,
): AdherenceResult {
  const logged = new Set(loggedDays);
  const earliestAllowed = shiftDay(today, -(maxWindowDays - 1));
  const windowStart = earliestDay > earliestAllowed ? earliestDay : earliestAllowed;

  const days: AdherenceDay[] = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    loggedCount: 0,
    totalCount: 0,
  }));

  let totalDays = 0;
  let totalLoggedDays = 0;
  for (let day = windowStart; day <= today; day = shiftDay(day, 1)) {
    const bucket = days[mondayIndex(day)];
    bucket.totalCount += 1;
    totalDays += 1;
    if (logged.has(day)) {
      bucket.loggedCount += 1;
      totalLoggedDays += 1;
    }
  }

  return { days, totalLoggedDays, totalDays, windowStart };
}

/**
 * Порог честности (раздел «План» спеки): меньше недели наблюдений — рано
 * рисовать столбики по дням недели, часть из них будет пустой не потому, что
 * человек пропускал день, а потому что этого дня недели ещё не было в окне.
 */
export const MIN_ADHERENCE_DAYS = 7;

export function hasEnoughAdherenceData(result: AdherenceResult): boolean {
  return result.totalDays >= MIN_ADHERENCE_DAYS;
}

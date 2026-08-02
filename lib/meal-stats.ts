// Статистика приёмов пищи: сколько их за неделю и за месяц, во сколько человек
// обычно ест и как приёмы распределены по типам.
//
// Зачем отдельно от приверженности (lib/adherence.ts). Та отвечает на вопрос
// «в какие дни я веду дневник», эта — «сколько и когда я ем». Дней с записями
// может быть семь из семи, а приёмов в них — то один, то шесть; это разные
// факты о разных вещах, и мерить их одним числом значило бы потерять оба.
//
// Модуль чистый: ни базы, ни `new Date()`. Окно задаётся аргументом `today` по
// тому же принципу, что в lib/adherence.ts и lib/reminders.ts, — поведение
// должно проверяться тестами на фиксированной дате.
//
// Оценок здесь нет и быть не может: «мало приёмов» и «много приёмов» — не
// свойства человека, а свойства дня. Числа, и ничего кроме (docs/product-spec.md,
// раздел 4.3).

import { MEAL_TYPE_LABELS, shiftDay } from "./dates.ts";
import { withPluralRu, type PluralForms } from "./plural.ts";

const MEAL_FORMS: PluralForms = ["приём пищи", "приёма пищи", "приёмов пищи"];
const DAY_FORMS: PluralForms = ["день", "дня", "дней"];

export type StatMeal = {
  eatenOn: string;
  /** Локальное время в виде «ЧЧ:ММ» — так же, как хранится в meals.eatenTime. */
  eatenTime: string;
  mealType: string;
};

export type PeriodKey = "week" | "month";

export type MealTypeStat = {
  mealType: string;
  label: string;
  count: number;
  /** Обычное время этого приёма — медиана. null, если приёмов не было. */
  typicalTime: string | null;
};

export type PeriodStats = {
  key: PeriodKey;
  label: string;
  /** Первый и последний день окна включительно. */
  from: string;
  to: string;
  /**
   * Сколько дней окна человек реально провёл в сервисе. У того, кто
   * зарегистрировался позавчера, «месяц» — это два дня, и делить на 30 было бы
   * враньём в его пользу наоборот.
   */
  days: number;
  mealCount: number;
  daysLogged: number;
  /**
   * Приёмов в день — по дням С ЗАПИСЯМИ, а не по всем дням окна.
   *
   * Деление на все дни смешало бы два разных факта: «я стал есть реже» и «я
   * стал реже записывать». Первое — про еду, второе — про дневник, и про
   * второе уже отвечает «Приверженность». null, если записей не было вовсе.
   */
  perLoggedDay: number | null;
  /** Типы приёмов по убыванию частоты; типы без записей не попадают. */
  byType: MealTypeStat[];
};

export type MealStats = {
  week: PeriodStats;
  month: PeriodStats;
};

const WINDOW_DAYS: Record<PeriodKey, number> = { week: 7, month: 30 };
const PERIOD_LABELS: Record<PeriodKey, string> = { week: "За неделю", month: "За месяц" };

/**
 * Порог показа. Один день в окне — это не статистика, а одна запись, и
 * «приёмов в день: 3,0» по единственному дню создаёт видимость закономерности
 * там, где её неоткуда взять. Тот же принцип, что MIN_ADHERENCE_DAYS.
 */
export const MIN_STATS_DAYS = 3;

export function hasEnoughMealStats(period: PeriodStats): boolean {
  return period.days >= MIN_STATS_DAYS && period.mealCount > 0;
}

/** «ЧЧ:ММ» → минуты от полуночи. NaN для мусора — такие значения отбрасываются. */
function toMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60) % 24;
  return `${String(hours).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

/**
 * Обычное время приёма — медиана, а не среднее.
 *
 * Один ужин, записанный в час ночи, сдвинул бы среднее на полчаса и объявил бы
 * «обычным» время, в которое человек не ест никогда. Медиана переживает такой
 * случай, не заметив его.
 *
 * Полночь модуль сознательно не «разворачивает» (круговой медианы здесь нет):
 * приёмы пищи в наших данных группируются внутри суток, а честная круговая
 * статистика ради редкого ночного перекуса усложнила бы модуль сильнее, чем
 * улучшила ответ. Для перекусов около полуночи медиана может уехать к
 * середине дня — поэтому она и называется «обычное время», а не «время».
 */
function medianTime(times: string[]): string | null {
  const minutes = times.map(toMinutes).filter((value) => !Number.isNaN(value)).sort((a, b) => a - b);
  if (minutes.length === 0) return null;
  const middle = Math.floor(minutes.length / 2);
  return toTime(minutes.length % 2 === 1 ? minutes[middle] : (minutes[middle - 1] + minutes[middle]) / 2);
}

function buildPeriod(key: PeriodKey, meals: StatMeal[], today: string, earliestDay: string): PeriodStats {
  const windowDays = WINDOW_DAYS[key];
  const earliestAllowed = shiftDay(today, -(windowDays - 1));
  const from = earliestDay > earliestAllowed ? earliestDay : earliestAllowed;

  let days = 0;
  for (let day = from; day <= today; day = shiftDay(day, 1)) days += 1;

  const inWindow = meals.filter((meal) => meal.eatenOn >= from && meal.eatenOn <= today);
  const loggedDays = new Set(inWindow.map((meal) => meal.eatenOn));

  const byTypeMap = new Map<string, string[]>();
  for (const meal of inWindow) {
    const list = byTypeMap.get(meal.mealType) ?? [];
    list.push(meal.eatenTime);
    byTypeMap.set(meal.mealType, list);
  }

  const byType: MealTypeStat[] = [...byTypeMap.entries()]
    .map(([mealType, times]) => ({
      mealType,
      label: MEAL_TYPE_LABELS[mealType] ?? MEAL_TYPE_LABELS.other,
      count: times.length,
      typicalTime: medianTime(times),
    }))
    // При равном числе — по названию, чтобы порядок не «прыгал» между
    // запросами: у Map порядок вставки, а он зависит от порядка строк из базы.
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));

  return {
    key,
    label: PERIOD_LABELS[key],
    from,
    to: today,
    days,
    mealCount: inWindow.length,
    daysLogged: loggedDays.size,
    perLoggedDay: loggedDays.size > 0 ? Math.round((inWindow.length / loggedDays.size) * 10) / 10 : null,
    byType,
  };
}

/**
 * @param meals Приёмы пищи за последние 30 дней и более — лишнее отсекается
 * окном, недостающее просто не попадёт в счёт.
 * @param earliestDay Первый день активности человека в сервисе; окно не
 * заходит раньше него (тот же приём, что в computeAdherence).
 */
export function computeMealStats(meals: StatMeal[], today: string, earliestDay: string): MealStats {
  return {
    week: buildPeriod("week", meals, today, earliestDay),
    month: buildPeriod("month", meals, today, earliestDay),
  };
}

/**
 * Строка для отчёта и письма — тем же детерминированным способом, что и текст
 * недельного обзора (lib/review.ts). Без оценок: сообщается факт и обычное
 * время, а вывод человек делает сам.
 */
export function describePeriod(period: PeriodStats): string {
  if (period.mealCount === 0) {
    return `${period.label.toLowerCase()} записей не было — так бывает, и навёрстывать ничего не нужно.`;
  }
  const parts = [
    `${withPluralRu(period.mealCount, MEAL_FORMS)} за ${withPluralRu(period.days, DAY_FORMS)}`,
    `в среднем ${formatDecimal(period.perLoggedDay ?? 0)} в день с записями`,
  ];
  const main = period.byType[0];
  if (main?.typicalTime) parts.push(`чаще всего это ${main.label.toLowerCase()}, обычно около ${main.typicalTime}`);
  return `${parts.join(", ")}.`;
}

function formatDecimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

// Недельный и месячный отчёты: что в них написано.
//
// Модуль чистый — ни базы, ни отправки, ни `new Date()`. Всё, что нужно, уже
// посчитано другими модулями и приходит аргументом; здесь только сборка.
//
// Текст детерминированный и без обращения к модели. Причина не в экономии:
// отчёт уходит человеку в почту раз в неделю, и он должен звучать одинаково
// каждый раз. Формулировка, которая сегодня «поддерживает», а через неделю
// случайно «оценивает», в письме опаснее, чем на экране, — письмо нельзя
// перечитать заново и увидеть другое.
//
// Оценок здесь нет. Ни «отличная неделя», ни «вы сдали»: числа и факты, вывод
// делает человек (docs/product-spec.md, 4.3).

import type { PeriodStats } from "./meal-stats.ts";
import { pluralRu, withPluralRu, type PluralForms } from "./plural.ts";
import { periodLabel, type ReportPeriod } from "./report-period.ts";
import { buildWeekReview, type DayStat } from "./review.ts";
import type { StreakResult } from "./streak.ts";
import type { Targets } from "./targets.ts";
import { formatKg, formatKgChange } from "./trend.ts";

const DAY_FORMS: PluralForms = ["день", "дня", "дней"];
const MEAL_FORMS: PluralForms = ["приём", "приёма", "приёмов"];
const SKIP_FORMS: PluralForms = ["пропуск", "пропуска", "пропусков"];

export type ReportInput = {
  period: ReportPeriod;
  showCalories: boolean;
  /** Показывать ли килограммы (lib/report-prefs.ts). Тренд показывается всегда. */
  weightNumbers: boolean;
  /** Дни периода, где есть записи. */
  dayStats: DayStat[];
  mealStats: PeriodStats;
  targets: Targets | null;
  weeklyTrendChangeKg: number | null;
  latestWeightKg: number | null;
  streak: StreakResult;
  /** Готовый раздел «Еда и вес» (lib/dish-impact.ts) или null, если рано. */
  impact: { title: string; text: string } | null;
  /**
   * Разбор питания и напоминания о привычках (lib/report-insight.ts). Пусто —
   * законный исход: модель выключена, данных мало или запрос не прошёл.
   * Отчёт без этих разделов остаётся полным отчётом.
   */
  insight?: ReportSection[];
};

export type ReportHighlight = { value: string; label: string };
export type ReportSection = { title: string; text: string };

export type Report = {
  period: ReportPeriod;
  /** «9–15 марта» или «Март». */
  label: string;
  /** Тема письма и первая строка сообщения в Telegram. */
  title: string;
  /** Числа крупно: то, что читается за секунду, не открывая текста. */
  highlights: ReportHighlight[];
  sections: ReportSection[];
  daysLogged: number;
};

const PERIOD_DAYS = { weekly: 7, monthly: 30 } as const;
const HORIZON = { weekly: "на неделю", monthly: "на месяц" } as const;
const TITLE = { weekly: "Неделя", monthly: "Месяц" } as const;

/**
 * Сколько дней в периоде на самом деле. У февраля их 28, у месяца с 31 днём —
 * 31, и писать «из 30» в обоих случаях значит ошибаться дважды.
 */
function daysInPeriod(period: ReportPeriod): number {
  const ms = Date.parse(`${period.to}T12:00:00Z`) - Date.parse(`${period.from}T12:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function buildReport(input: ReportInput): Report {
  const { period } = input;
  const label = periodLabel(period);
  const days = daysInPeriod(period) || PERIOD_DAYS[period.kind];

  const review = buildWeekReview({
    dayStats: input.dayStats,
    weeklyTrendChangeKg: input.weeklyTrendChangeKg,
    targets: input.targets,
    showCalories: input.showCalories,
    mealStats: input.mealStats,
    periodDays: days,
    focusHorizon: HORIZON[period.kind],
  });

  const sections: ReportSection[] = [...review.sections];

  // «Ритм» встаёт сразу после «Главного»: серия и накопленные дни — про то же
  // самое, про регулярность, и разносить их по разным концам письма значит
  // заставлять человека складывать одно с другим самому.
  const rhythm = rhythmText(input.streak);
  if (rhythm) sections.splice(1, 0, { title: "Ритм", text: rhythm });

  // Разбор питания — после чисел и ритма, но до «Еды и веса». Порядок читается
  // как разговор: сначала что произошло, потом что из этого видно, и только
  // потом самое осторожное — связь еды с весом.
  if (input.insight) sections.push(...input.insight);

  // «Еда и вес» — в самом конце и только когда наблюдений хватило. Это самый
  // осторожный раздел из всех, и стоять выше разбора питания ему нечего.
  if (input.impact) sections.push(input.impact);

  return {
    period,
    label,
    title: `${TITLE[period.kind]}: ${label}`,
    highlights: highlights(input, days),
    sections,
    daysLogged: review.daysLogged,
  };
}

function highlights(input: ReportInput, days: number): ReportHighlight[] {
  const out: ReportHighlight[] = [
    { value: `${input.dayStats.length} из ${days}`, label: "дней с записями" },
    { value: String(input.mealStats.mealCount), label: `${pluralRu(input.mealStats.mealCount, MEAL_FORMS)} пищи` },
  ];

  const avgKcal = average(input.dayStats.map((d) => d.kcal));
  if (input.showCalories && avgKcal !== null) out.push({ value: String(avgKcal), label: "ккал в среднем" });

  const avgProtein = average(input.dayStats.map((d) => d.protein));
  if (avgProtein !== null) out.push({ value: String(avgProtein), label: "белок, г в среднем" });

  if (input.weeklyTrendChangeKg !== null) {
    out.push({ value: formatKgChange(input.weeklyTrendChangeKg), label: "тренд, кг в неделю" });
  }
  // Килограммы — последними и только по настройке. Тренд выше остаётся в
  // любом случае: это изменение, а не вес.
  if (input.weightNumbers && input.latestWeightKg !== null) {
    out.push({ value: formatKg(input.latestWeightKg), label: "вес на конец периода, кг" });
  }
  return out;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Раздел про серию. Говорит то же, что енот на «Сегодня» (lib/mascot.ts), и по
 * тем же правилам: про пропуск — «так бывает», а не «вы пропустили», и рядом
 * всегда то, что никуда не делось.
 */
function rhythmText(streak: StreakResult): string | null {
  if (streak.totalDays === 0) return null;

  const total = `Всего дней с записями: ${streak.totalDays}`;
  const caring = streak.caringWeeks > 0
    ? `, недель с тремя и более днями: ${streak.caringWeeks}`
    : "";

  if (streak.current === 0) {
    return `Серия сейчас прервана — так бывает, и она собирается заново с первой же записи. ${total}${caring}.`;
  }
  const run = `Серия: ${withPluralRu(streak.current, DAY_FORMS)} подряд`;
  // Словом, а не цифрой: «1 пропуск закрыт» в связном предложении читается
  // как опечатка. Больше двух подряд не бывает (MAX_CONSECUTIVE_FREEZES),
  // третья ветка — на случай, если предел когда-нибудь поднимут.
  const count = streak.frozenDays.length;
  const frozen =
    count === 0 ? ""
    : count === 1 ? " (один пропуск закрыт заморозкой — их две в месяц, и просить их не нужно)"
    : count === 2 ? " (два пропуска закрыты заморозками — их две в месяц, и просить их не нужно)"
    : ` (${withPluralRu(count, SKIP_FORMS)} закрыты заморозками)`;
  return `${run}${frozen}. ${total}${caring}.`;
}

/** Есть ли смысл отправлять этот отчёт. Пустой период — повод промолчать. */
export function isReportWorthSending(report: Report, minDays: number): boolean {
  return report.daysLogged >= minDays;
}

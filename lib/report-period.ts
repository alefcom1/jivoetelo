// Периоды отчётов и правило «пора ли отправлять».
//
// Модуль чистый: ни базы, ни `new Date()` внутри. Отчёт, который уходит раз в
// неделю, иначе проверялся бы неделю — а проверять его надо на каждой границе
// месяца, на переводе часов и на понедельнике, выпавшем на первое число.
//
// Неделя здесь — понедельник–воскресенье, как в календаре и как в
// приверженности (lib/adherence.ts). Месяц — календарный, с первого по
// последнее число.

import { shiftDay } from "./dates.ts";
import type { LocalMoment } from "./dates.ts";

export type ReportKind = "weekly" | "monthly";

export type ReportPeriod = {
  kind: ReportKind;
  /** Первый день периода включительно. */
  from: string;
  /** Последний день периода включительно. */
  to: string;
};

/**
 * Час, раньше которого отчёты не уходят. Тот же порядок, что у писем серии:
 * отчёт, посчитанный в четыре утра, приходит в десять, а не будит
 * уведомлением.
 */
export const REPORT_HOUR = 10;

/**
 * Позже этого часа не начинаем: письмо, отправленное в 23:50, читается уже
 * завтра, и «за прошедшую неделю» в нём звучит странно.
 */
export const REPORT_UNTIL_HOUR = 21;

/**
 * Сколько дней с записями должно быть в периоде, чтобы отчёт имел смысл.
 *
 * Порог не про «мало старался» — он про то, что отчёт по двум дням это не
 * отчёт, а пересказ двух дней, который человек и так помнит. Прислать его
 * значит потратить внимание впустую, а прислать по пустому периоду — ещё и
 * упрекнуть за то, что человека не было.
 */
export const MIN_DAYS: Record<ReportKind, number> = { weekly: 3, monthly: 8 };

/** Понедельник недели, в которую попадает день. */
export function weekStart(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return shiftDay(day, -((date.getUTCDay() + 6) % 7));
}

/**
 * Последняя завершившаяся неделя относительно `today`. В понедельник это
 * прошлые понедельник–воскресенье; в среду — те же самые. Так пропущенный
 * запуск в понедельник не теряет отчёт: во вторник посчитается тот же период,
 * а уникальный индекс не даст отправить его дважды.
 */
export function previousWeek(today: string): ReportPeriod {
  const monday = weekStart(today);
  return { kind: "weekly", from: shiftDay(monday, -7), to: shiftDay(monday, -1) };
}

/** Последний завершившийся календарный месяц относительно `today`. */
export function previousMonth(today: string): ReportPeriod {
  const to = shiftDay(`${today.slice(0, 7)}-01`, -1);
  return { kind: "monthly", from: `${to.slice(0, 7)}-01`, to };
}

export function periodFor(kind: ReportKind, today: string): ReportPeriod {
  return kind === "weekly" ? previousWeek(today) : previousMonth(today);
}

/**
 * Период по его последнему дню. Нужен на отправке: в журнале доставок лежит
 * `period_end`, а не пара дат, — тождество отчёта определяется концом периода,
 * и хранить второе поле, выводимое из первого, значило бы завести способ их
 * рассогласовать.
 */
export function periodFromEnd(kind: ReportKind, end: string): ReportPeriod {
  return kind === "weekly"
    ? { kind, from: shiftDay(end, -6), to: end }
    : { kind, from: `${end.slice(0, 7)}-01`, to: end };
}

export function isReportKind(value: unknown): value is ReportKind {
  return value === "weekly" || value === "monthly";
}

/**
 * Можно ли сейчас отправлять отчёты вообще. Про конкретного человека это
 * ничего не говорит — только про время суток.
 */
export function withinSendWindow(moment: LocalMoment): boolean {
  return moment.hour >= REPORT_HOUR && moment.hour < REPORT_UNTIL_HOUR;
}

/**
 * Человеческое название периода: «9–15 марта», «март». Без года — отчёт
 * приходит через день после конца периода, и год в нём только шум.
 */
const MONTHS_OF = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NAME = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function periodLabel(period: ReportPeriod): string {
  if (period.kind === "monthly") return MONTHS_NAME[Number(period.from.slice(5, 7)) - 1];

  const fromDay = Number(period.from.slice(8, 10));
  const toDay = Number(period.to.slice(8, 10));
  const fromMonth = Number(period.from.slice(5, 7)) - 1;
  const toMonth = Number(period.to.slice(5, 7)) - 1;
  // «29 марта — 4 апреля» на стыке месяцев и «9–15 марта» внутри одного.
  return fromMonth === toMonth
    ? `${fromDay}–${toDay} ${MONTHS_OF[toMonth]}`
    : `${fromDay} ${MONTHS_OF[fromMonth]} — ${toDay} ${MONTHS_OF[toMonth]}`;
}

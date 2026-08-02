const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Дата вида YYYY-MM-DD, которая действительно существует.
 *
 * Одной проверки формы мало: «2026-13-40» ей соответствует, а «2026-02-30»
 * ещё и разбирается движком — молча, со сдвигом на 2 марта. Дальше по коду
 * такое значение считается настоящей датой: уходит в базу, попадает в
 * `new Date()` и там превращается либо в Invalid Date, либо в чужой день.
 * Поэтому дата разбирается и сверяется обратно со строкой.
 */
export function isValidDay(value: string | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function appTimeZone(): string {
  return process.env.APP_TIMEZONE ?? "Europe/Moscow";
}

/** Сегодняшняя дата в таймзоне продукта (по умолчанию московской). */
export function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone() }).format(new Date());
}

export type LocalMoment = { day: string; time: string; hour: number };

/**
 * Раскладывает момент времени на локальные дату, время и час.
 *
 * Момент передаётся аргументом, а не берётся из `new Date()`, потому что от
 * этих значений зависят и планировщик напоминаний, и дата приёма пищи из
 * фото-инбокса, — а такие правила должны проверяться тестами на фиксированном
 * времени, а не на «сейчас».
 */
export function localMoment(now: Date, timeZone: string = appTimeZone()): LocalMoment {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour");
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
    hour: Number(hour),
  };
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function formatDayRu(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/**
 * Короткая подпись давности для строки списка: «сегодня», «вчера», иначе
 * «3 июля». Без года и дня недели — в списке повторов важно не когда именно,
 * а «недавно или давно», и длинная дата там только мешает читать название.
 */
export function formatDayAgoRu(day: string, today: string = localToday()): string {
  if (day === today) return "сегодня";
  if (day === shiftDay(today, -1)) return "вчера";
  if (day === shiftDay(today, -2)) return "позавчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
  other: "Приём пищи",
};

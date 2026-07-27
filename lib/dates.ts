const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(value: string | undefined): value is string {
  return !!value && DATE_RE.test(value);
}

/** Сегодняшняя дата в таймзоне продукта (по умолчанию московской). */
export function localToday(): string {
  const timeZone = process.env.APP_TIMEZONE ?? "Europe/Moscow";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
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

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
  other: "Приём пищи",
};

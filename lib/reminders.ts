/**
 * Правила напоминаний в боте. Модуль намеренно чистый: никакой базы, никакого
 * `new Date()` внутри — весь контекст приходит аргументом. Иначе поведение
 * «в 23:40 бот молчит» пришлось бы проверять, дожидаясь 23:40.
 *
 * Главное правило здесь не техническое: напоминание не должно вызывать вину.
 * Поэтому мы не считаем серии, не пишем «вы пропустили» и никогда не
 * отправляем больше одного сообщения в день.
 */

import { pluralRu, withPluralRu } from "./plural.ts";

/** Час, раньше которого бот не пишет. Утро — не время для напоминаний о еде. */
export const QUIET_HOURS_END = 9;
/** Час, начиная с которого бот молчит до утра. */
export const QUIET_HOURS_START = 22;

export const DEFAULT_DIGEST_HOUR = 20;
export const MIN_DIGEST_HOUR = QUIET_HOURS_END;
export const MAX_DIGEST_HOUR = QUIET_HOURS_START - 1;

/** Час дайджеста от пользователя — недоверенное значение. */
export function normalizeDigestHour(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_DIGEST_HOUR;
  return Math.min(MAX_DIGEST_HOUR, Math.max(MIN_DIGEST_HOUR, n));
}

export type ReminderKind = "photo_digest" | "gentle_nudge";

export type ReminderPlan = {
  kind: ReminderKind;
  text: string;
};

export type ReminderContext = {
  now: Date;
  /** Локальные день и час пользователя — из `localMoment`. */
  localDay: string;
  localHour: number;
  remindersEnabled: boolean;
  digestHour: number;
  /** До этого момента бот молчит — кнопка «Пауза на 3 дня». */
  snoozedUntil: Date | null;
  /** День, когда бот уже писал. Больше одного сообщения в день не бывает. */
  lastReminderOn: string | null;
  /**
   * Неразобранные фото за сегодняшний день. Именно за сегодня, а не за всё
   * время: иначе одно забытое фото превратило бы дайджест в ежедневный укор.
   * Старые снимки никуда не деваются — они просто ждут в инбоксе молча.
   */
  pendingPhotosToday: number;
  /** Сколько приёмов пищи записано сегодня — в любом из клиентов. */
  mealsToday: number;
};

const PHOTO_FORMS = ["фото", "фото", "фото"] as const;
const WAITING_FORMS = ["ждёт", "ждут", "ждут"] as const;

export function photoDigestText(pendingPhotos: number): string {
  const photos = withPluralRu(pendingPhotos, PHOTO_FORMS);
  const wait = pluralRu(pendingPhotos, WAITING_FORMS);
  return `Собрали ваш день: ${photos} ${wait} разбора. Пара уточнений — и день закрыт.`;
}

export const GENTLE_NUDGE_TEXT =
  "Как прошёл день? Если было не до записей — просто пришлите фото, остальное соберём сами.";

/**
 * Решает, что отправить пользователю прямо сейчас, и отправлять ли вообще.
 * `null` означает «сегодня молчим» — это самый частый и совершенно нормальный
 * исход.
 */
export function planReminder(ctx: ReminderContext): ReminderPlan | null {
  if (!ctx.remindersEnabled) return null;
  if (ctx.snoozedUntil && ctx.now < ctx.snoozedUntil) return null;
  if (ctx.lastReminderOn === ctx.localDay) return null;
  if (ctx.localHour < QUIET_HOURS_END || ctx.localHour >= QUIET_HOURS_START) return null;
  if (ctx.localHour < normalizeDigestHour(ctx.digestHour)) return null;

  // Неразобранные фото — единственный повод, где у нас есть что показать.
  if (ctx.pendingPhotosToday > 0) {
    return { kind: "photo_digest", text: photoDigestText(ctx.pendingPhotosToday) };
  }

  // Пустой день. Пишем один раз и без упрёка: если человек не захотел ничего
  // записывать — это его право, а не повод для второго захода.
  if (ctx.mealsToday === 0) {
    return { kind: "gentle_nudge", text: GENTLE_NUDGE_TEXT };
  }

  // День записан, фото разобраны — писать не о чем.
  return null;
}

/**
 * «Пауза» вместо привычного «напомнить позже». Отложить на два часа
 * бессмысленно: до конца дня бот всё равно больше не пишет, а следующий заход
 * будет только завтра вечером. Поэтому кнопка честно называется паузой и
 * действительно выключает напоминания на несколько дней.
 */
export const SNOOZE_DAYS = 3;

export function snoozeUntil(now: Date): Date {
  return new Date(now.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000);
}

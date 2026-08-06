/**
 * Правила напоминаний в боте. Модуль намеренно чистый: никакой базы, никакого
 * `new Date()` внутри — весь контекст приходит аргументом. Иначе поведение
 * «в 23:40 бот молчит» пришлось бы проверять, дожидаясь 23:40.
 *
 * Главное правило здесь не техническое: напоминание не должно вызывать вину.
 * Поэтому мы не пишем «вы пропустили» и никогда не отправляем больше одного
 * сообщения в день.
 *
 * Серии дней раньше не считались вовсе — именно из-за этого правила. Теперь
 * они есть (lib/streak.ts), но в напоминание попадают не числом, а репликой
 * Живело: «серия сбилась, но 43 дня с записями остались». Разница не
 * косметическая. Голое число в сообщении бота работает как счётчик долга; та
 * же цифра из уст персонажа, который пропустил вместе с человеком, — как
 * напоминание о сделанном. Правила, при которых бот вообще открывает рот,
 * при этом не меняются ни на йоту: повод нужен прежний.
 */

import { mascotReminderLine } from "./mascot.ts";
import { pluralRu, withPluralRu } from "./plural.ts";
import type { StreakResult } from "./streak.ts";

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

export type ReminderKind = "photo_digest" | "gentle_nudge" | "weigh_nudge";

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
  /**
   * Серия дней. Необязательна: без неё напоминание остаётся ровно таким, каким
   * было, — строка Живело просто не добавляется.
   */
  streak?: StreakResult | null;
};

const PHOTO_FORMS = ["фото", "фото", "фото"] as const;
const WAITING_FORMS = ["ждёт", "ждут", "ждут"] as const;

/**
 * Оба текста уходят с `parse_mode: HTML` — как и всё остальное, что говорит
 * бот (lib/bot/markup.ts). Значок здесь один и означает время суток:
 * напоминание приходит вечером, и по первому символу это видно раньше, чем
 * прочитана строка.
 */
export function photoDigestText(pendingPhotos: number): string {
  const photos = withPluralRu(pendingPhotos, PHOTO_FORMS);
  const wait = pluralRu(pendingPhotos, WAITING_FORMS);
  return `🌙 <b>Собрали ваш день.</b>\n\n${photos} ${wait} разбора. Пара уточнений — и день закрыт.`;
}

export const GENTLE_NUDGE_TEXT =
  "🌙 <b>Как прошёл день?</b>\n\n" +
  "Если было не до записей — просто пришлите фото, остальное соберём сами.";

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
    return { kind: "photo_digest", text: withMascot(photoDigestText(ctx.pendingPhotosToday), ctx.streak) };
  }

  // Пустой день. Пишем один раз и без упрёка: если человек не захотел ничего
  // записывать — это его право, а не повод для второго захода.
  if (ctx.mealsToday === 0) {
    return { kind: "gentle_nudge", text: withMascot(GENTLE_NUDGE_TEXT, ctx.streak) };
  }

  // День записан, фото разобраны — писать не о чем.
  return null;
}

/**
 * Дописывает реплику Живело, если ему есть что сказать. Повод для самого
 * сообщения уже найден выше — персонаж не добавляет поводов, он добавляет
 * контекст к тому, что и так отправляется.
 */
function withMascot(text: string, streak: StreakResult | null | undefined): string {
  const line = streak ? mascotReminderLine(streak) : null;
  return line ? `${text}\n\n${line}` : text;
}

/**
 * ## Напоминание взвеситься
 *
 * Отдельно от вечернего дайджеста, и не только по времени суток.
 *
 * Во-первых, повод другой. Дайджест говорит о еде и приходит вечером, когда
 * день уже прожит. Взвешиваться имеет смысл утром натощак — это единственный
 * замер, который сравним со вчерашним.
 *
 * Во-вторых, согласие другое. `/stop` выключает разговор про еду, и человек,
 * нажавший его, не соглашался получать вместо этого «встаньте на весы».
 * Поэтому переключатель свой (`bot_preferences.weigh_reminders_enabled`), и
 * выключается он независимо.
 *
 * В-третьих, частота другая. Ежедневное напоминание о весе — это ежедневный
 * вопрос «ну что, похудел?», то есть ровно тот тон, которого мы избегаем во
 * всём остальном продукте. Раз в неделю, и только если замеров правда нет.
 */
export const WEIGH_REMINDER_HOUR = 9;
/** Не чаще раза в неделю. */
export const WEIGH_REMINDER_EVERY_DAYS = 7;
/**
 * Сколько дней без замера считаем поводом написать. Четыре, а не семь:
 * взвешивающемуся по субботам не за что напоминать, а тот, кто пропал на
 * четыре дня, скорее всего просто забыл.
 */
export const WEIGH_SILENCE_DAYS = 4;

export const WEIGH_REMINDER_TEXT =
  "⚖️ <b>Доброе утро.</b>\n\n" +
  "Если сегодня встанете на весы — пришлите число прямо сюда, одним сообщением: «72,4». " +
  "Больше ничего делать не нужно.\n\n" +
  "По этим замерам сервис уточняет вашу норму — формула про вас не знает, а тренд знает. " +
  "Не взвешиваться тоже нормально: дневник работает и без единой цифры веса.";

export type WeighReminderContext = {
  localDay: string;
  localHour: number;
  enabled: boolean;
  /** Дата последнего напоминания о весе — не чаще раза в неделю. */
  lastWeighReminderOn: string | null;
  /** Дата последнего замера веса. null — замеров не было вовсе. */
  lastWeightOn: string | null;
  /** Есть ли у человека профиль: без него норму всё равно не посчитать. */
  hasProfile: boolean;
};

/** Разница в днях между двумя датами `ГГГГ-ММ-ДД`. */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Писать ли сегодня про весы. `null` — «нет», и это самый частый исход.
 *
 * Функция чистая, как и planReminder: «в понедельник в 9 утра человеку,
 * который взвешивался в субботу, бот молчит» — это утверждение, которое
 * должно проверяться таблицей, а не ожиданием понедельника.
 */
export function planWeighReminder(ctx: WeighReminderContext): ReminderPlan | null {
  if (!ctx.enabled) return null;
  if (!ctx.hasProfile) return null;
  // Утро, и узкое: в час дня «доброе утро» звучит как сбой рассылки.
  if (ctx.localHour < WEIGH_REMINDER_HOUR || ctx.localHour >= WEIGH_REMINDER_HOUR + 3) return null;
  if (ctx.lastWeighReminderOn && daysBetween(ctx.lastWeighReminderOn, ctx.localDay) < WEIGH_REMINDER_EVERY_DAYS) {
    return null;
  }
  // Человек взвешивается сам — напоминать не о чем. Это главное условие:
  // напоминание существует ради пустого графика, а не ради ритуала.
  if (ctx.lastWeightOn && daysBetween(ctx.lastWeightOn, ctx.localDay) < WEIGH_SILENCE_DAYS) return null;

  return { kind: "weigh_nudge", text: WEIGH_REMINDER_TEXT };
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

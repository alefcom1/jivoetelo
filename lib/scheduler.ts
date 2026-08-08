/**
 * Планировщик: раз в минуту смотрит, что пора отправить.
 *
 * Отдельного воркера и очереди нет сознательно. Всё, что нужно очереди,
 * у нас уже есть в базе: строка доставки со сроком, отметка о захвате и
 * счётчик попыток. Отдельный контейнер с pg-boss дал бы те же гарантии,
 * но занял бы ещё сотню мегабайт на VPS, где их не так много.
 *
 * Идемпотентность держится на трёх вещах:
 *  - письма: строка `email_deliveries` захватывается через SKIP LOCKED и
 *    получает `sent_at` только после успешной отправки;
 *  - напоминания: дата в `bot_preferences.last_reminder_on` записывается
 *    ДО отправки. Потерять сообщение при перезапуске не страшно, отправить
 *    второе за день — куда неприятнее;
 *  - отчёты: уникальный индекс на (пользователь, вид, конец периода, канал).
 *    Строка вставляется через ON CONFLICT DO NOTHING, и право отправить
 *    получает тот, кто выиграл гонку (lib/report-dispatch.ts).
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { localMoment, shiftDay } from "./dates.ts";
import { isLetterNumber, parseSeriesContext, renderLetter } from "./email-series.ts";
import { unsubscribePostUrl, unsubscribeUrl } from "./email-subscribe.ts";
import { countPendingOnDay } from "./inbox.ts";
import { listLoggedDays } from "./meals.ts";
import { getMailer } from "./mailer.ts";
import { accessEndsAt, daysLeft, hasPaidAccess } from "./paid.ts";
import {
  planReminder,
  planTrialWarning,
  planWeighReminder,
  QUIET_HOURS_END,
  QUIET_HOURS_START,
  WEIGH_REMINDER_EVERY_DAYS,
  TRIAL_WARNING_HOUR,
  WEIGH_REMINDER_HOUR,
} from "./reminders.ts";
import { computeStreak } from "./streak.ts";
import { dispatchDueReports, enqueueDueReports } from "./report-dispatch.ts";
import { siteUrl } from "./site.ts";
import { botToken, createTelegramClient, trySend } from "./telegram-api.ts";
import { digestKeyboard } from "./bot/handle-update.ts";
import { sendMissingYou } from "./bot/media.ts";
import { botLinks, premiumButton } from "./bot/links.ts";

const TICK_MS = 60_000;
const EMAIL_BATCH = 20;
const REMINDER_BATCH = 200;
/** После пяти неудач перестаём пытаться: проблема не во временном сбое. */
const MAX_EMAIL_ATTEMPTS = 5;

type Rows<T> = { rows: T[] };

export type DispatchResult = { sent: number; failed: number };

/**
 * Отправляет письма, которым подошёл срок. Захват отделён от отправки: SMTP
 * может отвечать секундами, и держать всё это время транзакцию открытой —
 * плохая идея. Просроченный захват (старше 15 минут) считается неудачным и
 * достаётся следующему заходу.
 */
export async function dispatchDueEmails(now: Date, limit = EMAIL_BATCH): Promise<DispatchResult> {
  const db = getDb();
  const claimed = (await db.execute(sql`
    UPDATE email_deliveries AS target
       SET claimed_at = ${now}, attempts = target.attempts + 1
     WHERE target.id IN (
       SELECT d.id
         FROM email_deliveries d
         JOIN email_subscribers s ON s.id = d.subscriber_id
        WHERE d.sent_at IS NULL
          AND d.scheduled_for <= ${now}
          AND d.attempts < ${MAX_EMAIL_ATTEMPTS}
          AND (d.claimed_at IS NULL OR d.claimed_at < ${new Date(now.getTime() - 15 * 60_000)})
          AND s.unsubscribed_at IS NULL
        ORDER BY d.scheduled_for
        LIMIT ${limit}
        FOR UPDATE OF d SKIP LOCKED
     )
    RETURNING target.id, target.letter, target.subscriber_id
  `)) as unknown as Rows<{ id: number; letter: number; subscriber_id: number }>;

  const rows = claimed.rows ?? [];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const mailer = getMailer();
  const site = siteUrl();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const subscriber = (await db.execute(sql`
        SELECT email, context, unsubscribe_token, unsubscribed_at
          FROM email_subscribers WHERE id = ${row.subscriber_id} LIMIT 1
      `)) as unknown as Rows<{
        email: string;
        context: unknown;
        unsubscribe_token: string;
        unsubscribed_at: Date | null;
      }>;

      const person = subscriber.rows?.[0];
      // Отписка могла случиться между захватом и отправкой — проверяем снова.
      if (!person || person.unsubscribed_at) {
        await markFailed(row.id, "подписчик отписался", MAX_EMAIL_ATTEMPTS);
        failed += 1;
        continue;
      }

      const context = parseSeriesContext(person.context);
      if (!context || !isLetterNumber(row.letter)) {
        // Повторять нечего: данные не станут валиднее сами по себе.
        await markFailed(row.id, "непригодный контекст расчёта", MAX_EMAIL_ATTEMPTS);
        failed += 1;
        continue;
      }

      const letter = renderLetter(row.letter, context, {
        siteUrl: site,
        unsubscribeUrl: unsubscribeUrl(person.unsubscribe_token),
      });
      await mailer.send({
        to: person.email,
        subject: letter.subject,
        text: letter.text,
        html: letter.html,
        unsubscribePostUrl: unsubscribePostUrl(person.unsubscribe_token),
      });

      await db.execute(sql`UPDATE email_deliveries SET sent_at = ${new Date()}, last_error = NULL WHERE id = ${row.id}`);
      sent += 1;
    } catch (error) {
      console.error("email delivery failed", error);
      await markFailed(row.id, error instanceof Error ? error.message.slice(0, 300) : "unknown");
      failed += 1;
    }
  }

  return { sent, failed };
}

async function markFailed(id: number, message: string, forceAttempts?: number): Promise<void> {
  await getDb().execute(
    forceAttempts === undefined
      ? sql`UPDATE email_deliveries SET last_error = ${message} WHERE id = ${id}`
      : sql`UPDATE email_deliveries SET last_error = ${message}, attempts = ${forceAttempts} WHERE id = ${id}`,
  );
}

/**
 * Рассылает вечерние напоминания. Пользователи, которым точно писать не надо,
 * отсеиваются запросом, а не в коде: иначе каждый заход тянул бы из базы всех
 * привязавших Telegram, чтобы почти для всех вернуть null.
 */
export async function dispatchDueReminders(now: Date, limit = REMINDER_BATCH): Promise<DispatchResult> {
  const token = botToken();
  if (!token) return { sent: 0, failed: 0 };

  const moment = localMoment(now);
  // Вне «разрешённых часов» заходить в базу вообще незачем.
  if (moment.hour < QUIET_HOURS_END || moment.hour >= QUIET_HOURS_START) return { sent: 0, failed: 0 };

  const db = getDb();
  const candidates = (await db.execute(sql`
    SELECT u.id, u.telegram_user_id, u.created_at,
           COALESCE(p.reminders_enabled, TRUE) AS reminders_enabled,
           COALESCE(p.digest_hour, 20) AS digest_hour,
           p.snoozed_until,
           p.last_reminder_on
      FROM users u
      LEFT JOIN bot_preferences p ON p.user_id = u.id
     WHERE u.telegram_user_id IS NOT NULL
       AND COALESCE(p.reminders_enabled, TRUE)
       AND (p.snoozed_until IS NULL OR p.snoozed_until <= ${now})
       AND (p.last_reminder_on IS NULL OR p.last_reminder_on <> ${moment.day})
       AND COALESCE(p.digest_hour, 20) <= ${moment.hour}
     ORDER BY u.id
     LIMIT ${limit}
  `)) as unknown as Rows<{
    id: number;
    telegram_user_id: string;
    created_at: string | Date;
    reminders_enabled: boolean;
    digest_hour: number;
    snoozed_until: Date | null;
    last_reminder_on: string | null;
  }>;

  const rows = candidates.rows ?? [];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const client = createTelegramClient(token);
  const links = botLinks();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const [pendingPhotosToday, mealsToday, loggedDays] = await Promise.all([
        countPendingOnDay(row.id, moment.day),
        countMealsOnDay(row.id, moment.day),
        listLoggedDays(row.id),
      ]);

      const plan = planReminder({
        now,
        localDay: moment.day,
        localHour: moment.hour,
        silentDays: silentDays(loggedDays, asDate(row.created_at), moment.day),
        remindersEnabled: row.reminders_enabled,
        digestHour: row.digest_hour,
        snoozedUntil: row.snoozed_until,
        lastReminderOn: row.last_reminder_on,
        pendingPhotosToday,
        mealsToday,
        streak: computeStreak(loggedDays, moment.day),
      });
      if (!plan) continue;

      // Захват права на отправку. Если строку уже занял другой процесс или
      // другой заход этой же минуты, запрос не вернёт ничего — и мы молчим.
      const claimed = (await db.execute(sql`
        INSERT INTO bot_preferences (user_id, last_reminder_on)
        VALUES (${row.id}, ${moment.day})
        ON CONFLICT (user_id) DO UPDATE
           SET last_reminder_on = ${moment.day}, updated_at = ${now}
         WHERE bot_preferences.last_reminder_on IS DISTINCT FROM ${moment.day}
        RETURNING user_id
      `)) as unknown as Rows<{ user_id: number }>;
      if ((claimed.rows ?? []).length === 0) continue;

      /**
       * Седьмой день тишины уходит картинкой — грустным Живело. Единственное
       * сообщение с картинкой на всей лестнице; при отказе `sendMissingYou`
       * сам отправит текст, и напоминание не потеряется.
       */
      const options = { replyMarkup: digestKeyboard(links), disablePreview: true, parseMode: "HTML" as const };
      let ok = true;
      if (plan.kind === "silence_week") {
        await sendMissingYou(client, row.telegram_user_id, plan.text, options);
      } else {
        ok = await trySend(client, row.telegram_user_id, plan.text, options);
      }
      if (ok) sent += 1;
      else failed += 1;
    } catch (error) {
      console.error("reminder dispatch failed", error);
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * Утреннее «пришлите вес». Отдельный проход, а не ветка внутри вечернего:
 * у них разные часы, разные переключатели и разные даты последней отправки,
 * и общего между ними — только слово «напоминание».
 *
 * Кандидаты отбираются запросом целиком, включая дату последнего замера:
 * главное условие здесь — «человек давно не взвешивался», и вытаскивать ради
 * него всех привязавших Telegram незачем.
 */
export async function dispatchDueWeighReminders(now: Date, limit = REMINDER_BATCH): Promise<DispatchResult> {
  const token = botToken();
  if (!token) return { sent: 0, failed: 0 };

  const moment = localMoment(now);
  if (moment.hour < WEIGH_REMINDER_HOUR || moment.hour >= WEIGH_REMINDER_HOUR + 3) return { sent: 0, failed: 0 };

  const db = getDb();
  const candidates = (await db.execute(sql`
    SELECT u.id, u.telegram_user_id,
           COALESCE(p.weigh_reminders_enabled, TRUE) AS weigh_enabled,
           p.last_weigh_reminder_on,
           (SELECT MAX(w.on_date) FROM weight_entries w WHERE w.user_id = u.id) AS last_weight_on,
           (pr.user_id IS NOT NULL) AS has_profile
      FROM users u
      LEFT JOIN bot_preferences p ON p.user_id = u.id
      LEFT JOIN profiles pr ON pr.user_id = u.id
     WHERE u.telegram_user_id IS NOT NULL
       AND COALESCE(p.weigh_reminders_enabled, TRUE)
       AND pr.user_id IS NOT NULL
       AND (p.last_weigh_reminder_on IS NULL OR p.last_weigh_reminder_on <= ${shiftDay(moment.day, -WEIGH_REMINDER_EVERY_DAYS)})
     ORDER BY u.id
     LIMIT ${limit}
  `)) as unknown as Rows<{
    id: number;
    telegram_user_id: string;
    weigh_enabled: boolean;
    last_weigh_reminder_on: string | null;
    last_weight_on: string | null;
    has_profile: boolean;
  }>;

  const rows = candidates.rows ?? [];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const client = createTelegramClient(token);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const plan = planWeighReminder({
        localDay: moment.day,
        localHour: moment.hour,
        enabled: row.weigh_enabled,
        lastWeighReminderOn: asDay(row.last_weigh_reminder_on),
        lastWeightOn: asDay(row.last_weight_on),
        hasProfile: row.has_profile,
      });
      if (!plan) continue;

      // Захват права на отправку — тем же приёмом, что у вечернего дайджеста:
      // дата пишется ДО отправки, и второй процесс уходит ни с чем.
      const claimed = (await db.execute(sql`
        INSERT INTO bot_preferences (user_id, last_weigh_reminder_on)
        VALUES (${row.id}, ${moment.day})
        ON CONFLICT (user_id) DO UPDATE
           SET last_weigh_reminder_on = ${moment.day}, updated_at = ${now}
         WHERE bot_preferences.last_weigh_reminder_on IS DISTINCT FROM ${moment.day}
        RETURNING user_id
      `)) as unknown as Rows<{ user_id: number }>;
      if ((claimed.rows ?? []).length === 0) continue;

      const ok = await trySend(client, row.telegram_user_id, plan.text, {
        disablePreview: true,
        parseMode: "HTML",
      });
      if (ok) sent += 1;
      else failed += 1;
    } catch (error) {
      console.error("weigh reminder dispatch failed", error);
      failed += 1;
    }
  }

  return { sent, failed };
}


/**
 * Предупреждение о конце пробного месяца — один раз, за три дня.
 *
 * Кандидатов ищем по дате регистрации, а не по `access_until`: пробный месяц
 * отсчитывается от неё (lib/paid.ts), и у человека, который ни разу не платил,
 * `access_until` пуст вовсе. Заплативших отсекаем тем же `hasPaidAccess`, что
 * и весь остальной продукт: два места, считающих доступ по-своему, однажды
 * разойдутся — и разойдутся молча.
 */
export async function dispatchDueTrialWarnings(now: Date, limit = REMINDER_BATCH): Promise<DispatchResult> {
  const token = botToken();
  if (!token) return { sent: 0, failed: 0 };

  const moment = localMoment(now);
  if (moment.hour < TRIAL_WARNING_HOUR || moment.hour >= TRIAL_WARNING_HOUR + 3) return { sent: 0, failed: 0 };

  const db = getDb();
  const candidates = (await db.execute(sql`
    SELECT u.id, u.telegram_user_id, u.created_at, u.access_until,
           COALESCE(p.reminders_enabled, TRUE) AS reminders_enabled,
           p.trial_warning_on
      FROM users u
      LEFT JOIN bot_preferences p ON p.user_id = u.id
     WHERE u.telegram_user_id IS NOT NULL
       AND COALESCE(p.reminders_enabled, TRUE)
       AND p.trial_warning_on IS NULL
     ORDER BY u.id
     LIMIT ${limit}
  `)) as unknown as Rows<{
    id: number;
    telegram_user_id: string;
    created_at: string | Date;
    access_until: string | Date | null;
    reminders_enabled: boolean;
    trial_warning_on: string | Date | null;
  }>;

  const rows = candidates.rows ?? [];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const client = createTelegramClient(token);
  const links = botLinks();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const createdAt = asDate(row.created_at);
      const accessUntil = row.access_until ? asDate(row.access_until) : null;
      const ends = accessEndsAt(accessUntil, createdAt, now);
      if (!ends) continue;

      const plan = planTrialWarning({
        localHour: moment.hour,
        enabled: row.reminders_enabled,
        daysLeft: daysLeft(accessUntil, createdAt, now),
        paid: hasPaidAccess(accessUntil, now),
        warned: row.trial_warning_on !== null,
        until: TRIAL_DATE.format(ends),
      });
      if (!plan) continue;

      // Захват права на отправку — тем же приёмом, что у напоминаний: дата
      // пишется ДО отправки, и второй процесс уходит ни с чем.
      const claimed = (await db.execute(sql`
        INSERT INTO bot_preferences (user_id, trial_warning_on)
        VALUES (${row.id}, ${moment.day})
        ON CONFLICT (user_id) DO UPDATE
           SET trial_warning_on = ${moment.day}, updated_at = ${now}
         WHERE bot_preferences.trial_warning_on IS NULL
        RETURNING user_id
      `)) as unknown as Rows<{ user_id: number }>;
      if ((claimed.rows ?? []).length === 0) continue;

      const ok = await trySend(client, row.telegram_user_id, plan.text, {
        disablePreview: true,
        parseMode: "HTML",
        replyMarkup: { inline_keyboard: [[premiumButton(links)]] },
      });
      if (ok) sent += 1;
      else failed += 1;
    } catch (error) {
      console.error("trial warning dispatch failed", error);
      failed += 1;
    }
  }

  return { sent, failed };
}

/** Дата словами для текста предупреждения: «5 сентября». */
const TRIAL_DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/**
 * `timestamptz` приходит то строкой, то объектом Date — как и `date` у соседа
 * ниже. Разница в том, что здесь нужен момент времени целиком, а не сутки.
 */
function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Сколько дней подряд человек ничего не записывает, считая сегодняшний.
 *
 * Отсчёт от последнего дня с записями, а у того, кто не записал ни разу, — от
 * дня регистрации. Это два разных человека: один забросил дневник, второй его
 * ещё не начинал, и говорить им «ваши записи ждут» одинаково нельзя — у
 * второго записей нет.
 *
 * `loggedDays` уже прочитаны выше для подсчёта серии, поэтому запроса не
 * добавляется: считаем по тому же массиву.
 */
function silentDays(loggedDays: string[], createdAt: Date, today: string): number {
  const last = loggedDays.filter((day) => day < today).sort().at(-1);
  const from = last ?? createdAt.toISOString().slice(0, 10);
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
  // Не меньше единицы: сюда попадают только те, у кого сегодня пусто, и
  // «ноль дней тишины» при пустом дне — это не число, а сбой отсчёта.
  return Math.max(1, days);
}

/**
 * `date` из PostgreSQL приходит то строкой, то объектом Date — зависит от
 * драйвера и от того, шёл ли запрос через `execute`. Правила напоминаний
 * сравнивают строки `ГГГГ-ММ-ДД`, и приводить их надо в одном месте.
 */
function asDay(value: string | Date | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

async function countMealsOnDay(userId: number, day: string): Promise<number> {
  const result = (await getDb().execute(sql`
    SELECT COUNT(*)::int AS value FROM meals WHERE user_id = ${userId} AND eaten_on = ${day}
  `)) as unknown as Rows<{ value: number }>;
  return result.rows?.[0]?.value ?? 0;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function tick(now: Date = new Date()): Promise<void> {
  // Заходы не должны накладываться: медленный SMTP не повод запустить второй
  // цикл поверх первого.
  if (running) return;
  running = true;
  try {
    await dispatchDueEmails(now);
    await dispatchDueReminders(now);
    await dispatchDueWeighReminders(now);
    await dispatchDueTrialWarnings(now);
    // Отчёты: сначала ставим в очередь то, у чего кончился период, потом
    // отправляем очередь. Порядок именно такой — поставленное в этот же заход
    // уходит сразу, а не ждёт следующей минуты.
    await enqueueDueReports(now);
    await dispatchDueReports(now);
  } catch (error) {
    console.error("scheduler tick failed", error);
  } finally {
    running = false;
  }
}

/** Запускается из instrumentation.ts при старте сервера. */
export function startScheduler(): void {
  if (timer) return;
  if (process.env.SCHEDULER_ENABLED === "false") {
    console.info("[scheduler] выключен через SCHEDULER_ENABLED=false");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.info("[scheduler] не запущен: нет DATABASE_URL");
    return;
  }

  timer = setInterval(() => void tick(), TICK_MS);
  // Не держим процесс живым ради таймера: контейнер должен уметь остановиться.
  timer.unref?.();
  console.info("[scheduler] запущен, шаг 60 с");
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

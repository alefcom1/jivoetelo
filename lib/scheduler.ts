/**
 * Планировщик: раз в минуту смотрит, что пора отправить.
 *
 * Отдельного воркера и очереди нет сознательно. Всё, что нужно очереди,
 * у нас уже есть в базе: строка доставки со сроком, отметка о захвате и
 * счётчик попыток. Отдельный контейнер с pg-boss дал бы те же гарантии,
 * но занял бы ещё сотню мегабайт на VPS, где их не так много.
 *
 * Идемпотентность держится на двух вещах:
 *  - письма: строка `email_deliveries` захватывается через SKIP LOCKED и
 *    получает `sent_at` только после успешной отправки;
 *  - напоминания: дата в `bot_preferences.last_reminder_on` записывается
 *    ДО отправки. Потерять сообщение при перезапуске не страшно, отправить
 *    второе за день — куда неприятнее.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { localMoment } from "./dates.ts";
import { isLetterNumber, parseSeriesContext, renderLetter } from "./email-series.ts";
import { unsubscribePostUrl, unsubscribeUrl } from "./email-subscribe.ts";
import { countPendingOnDay } from "./inbox.ts";
import { getMailer } from "./mailer.ts";
import { planReminder, QUIET_HOURS_END, QUIET_HOURS_START } from "./reminders.ts";
import { siteUrl } from "./site.ts";
import { botToken, createTelegramClient, trySend } from "./telegram-api.ts";
import { digestKeyboard } from "./bot/handle-update.ts";
import { botLinks } from "./bot/links.ts";

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
    SELECT u.id, u.telegram_user_id,
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
      const [pendingPhotosToday, mealsToday] = await Promise.all([
        countPendingOnDay(row.id, moment.day),
        countMealsOnDay(row.id, moment.day),
      ]);

      const plan = planReminder({
        now,
        localDay: moment.day,
        localHour: moment.hour,
        remindersEnabled: row.reminders_enabled,
        digestHour: row.digest_hour,
        snoozedUntil: row.snoozed_until,
        lastReminderOn: row.last_reminder_on,
        pendingPhotosToday,
        mealsToday,
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

      const ok = await trySend(client, row.telegram_user_id, plan.text, {
        replyMarkup: digestKeyboard(links),
        disablePreview: true,
        // Тексты напоминаний размечены так же, как остальные ответы бота.
        parseMode: "HTML",
      });
      if (ok) sent += 1;
      else failed += 1;
    } catch (error) {
      console.error("reminder dispatch failed", error);
      failed += 1;
    }
  }

  return { sent, failed };
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

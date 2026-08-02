// Отправка недельных и месячных отчётов. Две фазы, и разделены они не ради
// красоты.
//
//  1. Постановка в очередь. Раз в минуту находим тех, у кого период
//     закончился, а строки в журнале ещё нет, и вставляем её через
//     ON CONFLICT DO NOTHING. Выигравший гонку получает право отправить,
//     остальные не получают ничего. Это и есть вся защита от дублей — ни
//     блокировок, ни «а вдруг два процесса».
//
//  2. Отправка. Строка захватывается через SKIP LOCKED, отчёт собирается и
//     уходит, и только после успеха проставляется sent_at. Сборка отчёта —
//     это с десяток запросов на человека, и держать транзакцию открытой всё
//     это время незачем.
//
// Почему не переиспользован dispatchDueEmails: там строки привязаны к
// анонимным подписчикам почтовой серии (у них нет user_id), а при неожиданном
// содержимом обработчик ставит attempts на максимум и прекращает попытки
// навсегда. Для отчёта, где «неожиданное» — это временно недосчитавшаяся
// статистика, это означало бы потерю отчёта без шанса на повтор.

import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { localMoment } from "./dates.ts";
import { getMailer } from "./mailer.ts";
import {
  buildUserReport,
  getRecipient,
  readPreferences,
  type ReportRecipient,
} from "./report-data.ts";
import {
  isReportKind,
  MIN_DAYS,
  periodFor,
  periodFromEnd,
  withinSendWindow,
  type ReportKind,
} from "./report-period.ts";
import { renderReportEmail, renderReportTelegram } from "./report-render.ts";
import { resolveChannels, type ReportChannel } from "./report-prefs.ts";
import { siteUrl } from "./site.ts";
import { botToken, createTelegramClient, trySend } from "./telegram-api.ts";

const ENQUEUE_BATCH = 200;
const SEND_BATCH = 20;
/** После пяти неудач перестаём пытаться: проблема не во временном сбое. */
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 15 * 60_000;

type Rows<T> = { rows: T[] };

export type DispatchResult = { sent: number; failed: number };

function settingsUrl(): string {
  return `${siteUrl()}/app/settings`;
}

/**
 * Ставит в очередь отчёты за завершившийся период.
 *
 * Кандидаты отбираются запросом, а не в коде: иначе каждый заход тянул бы всех
 * пользователей, чтобы почти для всех ничего не сделать. Порог по дням с
 * записями — там же (HAVING): отчёт по двум дням это пересказ двух дней,
 * который человек и так помнит, а по пустому периоду — упрёк за то, что его
 * не было.
 */
export async function enqueueDueReports(now: Date, limit = ENQUEUE_BATCH): Promise<number> {
  const moment = localMoment(now);
  if (!withinSendWindow(moment)) return 0;

  let queued = 0;
  for (const kind of ["weekly", "monthly"] as ReportKind[]) {
    const period = periodFor(kind, moment.day);
    const candidates = (await getDb().execute(sql`
      SELECT u.id, u.email, u.telegram_user_id,
             p.weekly, p.monthly, p.weight_numbers
        FROM users u
        JOIN meals m ON m.user_id = u.id AND m.eaten_on BETWEEN ${period.from} AND ${period.to}
        LEFT JOIN report_preferences p ON p.user_id = u.id
       WHERE NOT EXISTS (
         SELECT 1 FROM report_deliveries d
          WHERE d.user_id = u.id AND d.kind = ${kind} AND d.period_end = ${period.to}
       )
       GROUP BY u.id, p.weekly, p.monthly, p.weight_numbers
      HAVING COUNT(DISTINCT m.eaten_on) >= ${MIN_DAYS[kind]}
       ORDER BY u.id
       LIMIT ${limit}
    `)) as unknown as Rows<{
      id: number;
      email: string | null;
      telegram_user_id: string | null;
      weekly: string | null;
      monthly: string | null;
      weight_numbers: boolean | null;
    }>;

    for (const row of candidates.rows ?? []) {
      const prefs = readPreferences(row);
      const channels = resolveChannels(kind, prefs, {
        hasEmail: Boolean(row.email),
        hasTelegram: Boolean(row.telegram_user_id),
      });
      for (const channel of channels) {
        const inserted = (await getDb().execute(sql`
          INSERT INTO report_deliveries (user_id, kind, period_end, channel)
          VALUES (${row.id}, ${kind}, ${period.to}, ${channel})
          ON CONFLICT (user_id, kind, period_end, channel) DO NOTHING
          RETURNING id
        `)) as unknown as Rows<{ id: number }>;
        queued += (inserted.rows ?? []).length;
      }
    }
  }
  return queued;
}

/** Отправляет поставленные в очередь отчёты. */
export async function dispatchDueReports(now: Date, limit = SEND_BATCH): Promise<DispatchResult> {
  const db = getDb();
  const claimed = (await db.execute(sql`
    UPDATE report_deliveries AS target
       SET claimed_at = ${now}, attempts = target.attempts + 1
     WHERE target.id IN (
       SELECT d.id
         FROM report_deliveries d
        WHERE d.sent_at IS NULL
          AND d.attempts < ${MAX_ATTEMPTS}
          AND (d.claimed_at IS NULL OR d.claimed_at < ${new Date(now.getTime() - CLAIM_TIMEOUT_MS)})
        ORDER BY d.created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING target.id, target.user_id, target.kind, target.period_end, target.channel
  `)) as unknown as Rows<{
    id: number;
    user_id: number;
    kind: string;
    period_end: string;
    channel: string;
  }>;

  const rows = claimed.rows ?? [];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (!isReportKind(row.kind)) {
        await markFailed(row.id, `неизвестный вид отчёта: ${row.kind}`, MAX_ATTEMPTS);
        failed += 1;
        continue;
      }
      const recipient = await getRecipient(row.user_id);
      if (!recipient) {
        await markFailed(row.id, "пользователь не найден", MAX_ATTEMPTS);
        failed += 1;
        continue;
      }

      // Настройки могли поменяться между постановкой в очередь и отправкой:
      // человек выключил отчёты, и сообщение уже не должно уходить.
      const allowed = resolveChannels(row.kind, recipient.prefs, {
        hasEmail: Boolean(recipient.email),
        hasTelegram: Boolean(recipient.telegramUserId),
      });
      if (!allowed.includes(row.channel as ReportChannel)) {
        await markSkipped(row.id, "канал отключён в настройках");
        continue;
      }

      const report = await buildUserReport(recipient, periodFromEnd(row.kind, row.period_end));
      const delivered = row.channel === "email"
        ? await sendByEmail(recipient, report)
        : await sendByTelegram(recipient, report);

      if (!delivered) {
        await markFailed(row.id, "канал не принял сообщение");
        failed += 1;
        continue;
      }
      await db.execute(sql`UPDATE report_deliveries SET sent_at = ${new Date()}, last_error = NULL WHERE id = ${row.id}`);
      sent += 1;
    } catch (error) {
      console.error("report delivery failed", error);
      await markFailed(row.id, error instanceof Error ? error.message.slice(0, 300) : "unknown");
      failed += 1;
    }
  }
  return { sent, failed };
}

/**
 * Отчёт, который решено не отправлять. Помечается как отправленный, но с
 * пояснением: иначе строка вечно будет всплывать в выборке «что пора», а
 * повторять решение «не отправлять» на каждом заходе незачем.
 */
async function markSkipped(id: number, reason: string): Promise<void> {
  await getDb().execute(
    sql`UPDATE report_deliveries SET sent_at = ${new Date()}, last_error = ${`пропущено: ${reason}`} WHERE id = ${id}`,
  );
}

async function markFailed(id: number, message: string, forceAttempts?: number): Promise<void> {
  await getDb().execute(
    forceAttempts === undefined
      ? sql`UPDATE report_deliveries SET last_error = ${message} WHERE id = ${id}`
      : sql`UPDATE report_deliveries SET last_error = ${message}, attempts = ${forceAttempts} WHERE id = ${id}`,
  );
}

async function sendByEmail(recipient: ReportRecipient, report: Awaited<ReturnType<typeof buildUserReport>>): Promise<boolean> {
  if (!recipient.email) return false;
  const links = { siteUrl: siteUrl(), settingsUrl: settingsUrl() };
  const letter = renderReportEmail(report, null, links);
  await getMailer().send({
    to: recipient.email,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  });
  return true;
}

async function sendByTelegram(recipient: ReportRecipient, report: Awaited<ReturnType<typeof buildUserReport>>): Promise<boolean> {
  const token = botToken();
  if (!token || !recipient.telegramUserId) return false;
  const text = renderReportTelegram(report, { siteUrl: siteUrl(), settingsUrl: settingsUrl() });
  return trySend(createTelegramClient(token), recipient.telegramUserId, text, {
    parseMode: "HTML",
    disablePreview: true,
  });
}

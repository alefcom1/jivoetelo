/**
 * Подписка на почтовую серию и отписка от неё. Здесь только работа с базой:
 * тексты писем и расписание живут в lib/email-series.ts, отправка — в
 * lib/mailer.ts.
 */

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { emailDeliveries, emailSubscribers } from "@/db/schema";
import { LETTER_NUMBERS, scheduleLetterAt, type SeriesContext } from "./email-series.ts";
import { absoluteUrl } from "./site.ts";

/** Откуда пришёл адрес. Пока точка входа одна, но столбец рассчитан на рост. */
export const SUBSCRIBE_SOURCES = ["raschet_energiya"] as const;
export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

export function newUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Страница отписки для человека — эта ссылка стоит в тексте письма. */
export function unsubscribeUrl(token: string): string {
  return absoluteUrl(`/pochta/otpiska?token=${encodeURIComponent(token)}`);
}

/**
 * Адрес для заголовка List-Unsubscribe. Почтовый клиент шлёт туда POST и
 * страницу не показывает, поэтому обработчик отдельный.
 */
export function unsubscribePostUrl(token: string): string {
  return absoluteUrl(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`);
}

export type SubscribeResult = "subscribed" | "already";

/**
 * Заводит подписчика и сразу создаёт строки на все три письма. Планировщику
 * тогда достаточно спрашивать «что пора отправить» — ему не нужно знать, как
 * устроена серия и сколько в ней писем.
 *
 * Повторная подписка активного адреса ничего не меняет и не создаёт вторую
 * серию. Подписка адреса, который раньше отписался, — новое явное согласие,
 * поэтому серия начинается заново.
 */
export async function subscribeToSeries(input: {
  email: string;
  source: SubscribeSource;
  consentVersion: string;
  context: SeriesContext;
  now: Date;
}): Promise<SubscribeResult> {
  const db = getDb();
  const existing = await db
    .select({ id: emailSubscribers.id, unsubscribedAt: emailSubscribers.unsubscribedAt })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.email, input.email))
    .limit(1);

  const found = existing[0];
  if (found && !found.unsubscribedAt) return "already";

  let subscriberId: number;
  if (found) {
    await db
      .update(emailSubscribers)
      .set({
        unsubscribedAt: null,
        source: input.source,
        consentVersion: input.consentVersion,
        context: input.context,
        createdAt: input.now,
      })
      .where(eq(emailSubscribers.id, found.id));
    // Старые строки доставки относятся к прошлой серии: часть уже отправлена,
    // и без удаления новая серия молча не состоялась бы.
    await db.delete(emailDeliveries).where(eq(emailDeliveries.subscriberId, found.id));
    subscriberId = found.id;
  } else {
    const inserted = await db
      .insert(emailSubscribers)
      .values({
        email: input.email,
        source: input.source,
        consentVersion: input.consentVersion,
        context: input.context,
        unsubscribeToken: newUnsubscribeToken(),
        createdAt: input.now,
      })
      .returning({ id: emailSubscribers.id });
    subscriberId = inserted[0].id;
  }

  await db.insert(emailDeliveries).values(
    LETTER_NUMBERS.map((letter) => ({
      subscriberId,
      letter,
      scheduledFor: scheduleLetterAt(input.now, letter),
    })),
  );

  return "subscribed";
}

/**
 * Отписывает по токену. Идемпотентна: повторный переход по той же ссылке —
 * обычное дело (клиент почты мог сходить по ней сам), и он должен показывать
 * тот же спокойный результат, а не ошибку.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  // Обновляем только ещё не отписанных: время первой отписки — это запись о
  // том, когда согласие было отозвано, и переписывать её повторным переходом
  // по ссылке нельзя.
  const updated = await getDb()
    .update(emailSubscribers)
    .set({ unsubscribedAt: new Date() })
    .where(and(eq(emailSubscribers.unsubscribeToken, token), isNull(emailSubscribers.unsubscribedAt)))
    .returning({ id: emailSubscribers.id });
  if (updated.length > 0) {
    // Неотправленные письма серии больше не нужны. Планировщик и так
    // проверяет отписку, но удалённая строка надёжнее любой проверки и не
    // мозолит глаза в отчётах.
    await getDb()
      .delete(emailDeliveries)
      .where(and(eq(emailDeliveries.subscriberId, updated[0].id), isNull(emailDeliveries.sentAt)));
    return true;
  }

  // Ноль строк — либо токен неизвестен, либо человек уже отписан. Второе для
  // него выглядит так же успешно, как первое.
  const existing = await getDb()
    .select({ id: emailSubscribers.id })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.unsubscribeToken, token))
    .limit(1);
  return existing.length > 0;
}

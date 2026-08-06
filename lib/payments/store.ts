/**
 * Платежи в базе: запись уведомления, поиск плательщика, выдача доступа.
 *
 * Отделено от разбора уведомления (`lib/payments/tribute.ts`) сознательно.
 * Там — чистые функции без базы, которые можно прогнать тестами на любых
 * телах; здесь — работа с данными. Смешать их значило бы получить обработчик,
 * который нельзя проверить, не подняв Postgres.
 */

import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentEvents, payments, users } from "@/db/schema";
import { grantAccessDays } from "../vouchers-store.ts";
import { parseRef, type TributeEvent } from "./tribute.ts";

/** Как нашли человека. Порядок в типе — порядок надёжности. */
export type MatchedBy = "ref" | "telegram" | "email" | "manual";

export type Match = { userId: number; matchedBy: MatchedBy } | null;

/**
 * Кому засчитать платёж.
 *
 * Три пути, и они не равноценны:
 *
 * 1. **Метка из ссылки** — единственный путь, который мы полностью
 *    контролируем: ссылку выдаём мы, подпись проверяем мы. Если Tribute
 *    вернул её обратно, вопрос закрыт.
 * 2. **Telegram** — надёжен там, где человек платил из Mini App: покупатель у
 *    Tribute и владелец аккаунта у нас это один и тот же Telegram.
 * 3. **Почта** — последний. Человек мог заплатить с чужой почты или указать
 *    её с опечаткой, а совпадение по почте выглядит убедительно и потому
 *    опаснее прочих: ошибку здесь никто не заметит.
 *
 * Ничего не нашлось — это не сбой. Платёж запишется без человека и будет
 * виден в админке; привязать его руками занимает секунды, а вот выданный не
 * тому доступ разбирается долго.
 */
export async function matchPayer(event: TributeEvent, refSecret: string): Promise<Match> {
  const db = getDb();

  const fromRef = parseRef(event.ref, refSecret);
  if (fromRef !== null) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, fromRef)).limit(1);
    if (rows[0]) return { userId: rows[0].id, matchedBy: "ref" };
  }

  if (event.telegramUserId) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramUserId, event.telegramUserId))
      .limit(1);
    if (rows[0]) return { userId: rows[0].id, matchedBy: "telegram" };
  }

  if (event.email) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${event.email}`)
      .limit(1);
    if (rows[0]) return { userId: rows[0].id, matchedBy: "email" };
  }

  return null;
}

export type ApplyResult =
  | { outcome: "applied"; paymentId: number; userId: number; accessUntil: Date }
  | { outcome: "unmatched"; paymentId: number }
  | { outcome: "duplicate"; paymentId: number };

/**
 * Записать платёж и, если есть кому, продлить доступ.
 *
 * Идемпотентность — на уникальном индексе `payments.external_id`, а не на
 * проверке «а нет ли уже такого»: между проверкой и вставкой помещается
 * повторное уведомление, а платёжные сервисы шлют их по несколько раз именно
 * тогда, когда первое обработалось медленно.
 *
 * Порядок тоже не случайный: сначала вставка платежа, потом продление. При
 * повторе вставка не пройдёт, и до продления дело не дойдёт — доступ не
 * удвоится. Обратный порядок продлевал бы по каждому дублю.
 */
export async function applyPayment(input: {
  provider: string;
  externalId: string;
  sum: string;
  tariff: string | null;
  days: number | null;
  match: Match;
  payload: unknown;
}): Promise<ApplyResult> {
  const db = getDb();

  const inserted = await db
    .insert(payments)
    .values({
      provider: input.provider,
      externalId: input.externalId,
      userId: input.match?.userId ?? null,
      sum: input.sum,
      status: "paid",
      tariff: input.tariff,
      matchedBy: input.match?.matchedBy ?? null,
      payload: input.payload as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: payments.externalId })
    .returning({ id: payments.id });

  if (!inserted[0]) {
    const existing = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.externalId, input.externalId))
      .limit(1);
    return { outcome: "duplicate", paymentId: existing[0]?.id ?? 0 };
  }

  const paymentId = inserted[0].id;
  if (!input.match || !input.days) return { outcome: "unmatched", paymentId };

  const accessUntil = await grantAccessDays(input.match.userId, input.days);
  await db.update(payments).set({ appliedAt: new Date() }).where(eq(payments.id, paymentId));
  return { outcome: "applied", paymentId, userId: input.match.userId, accessUntil };
}

/**
 * Привязать зависший платёж к человеку и выдать доступ.
 *
 * Отдельно от `applyPayment`, потому что случай другой: там уведомление
 * только что пришло, здесь администратор разбирает то, что уже лежит. Защита
 * от двойной выдачи — не индекс, а `applied_at`: он проставляется в том же
 * запросе, что и проверяется.
 */
export async function attachPayment(paymentId: number, userId: number, days: number): Promise<boolean> {
  const db = getDb();
  const claimed = await db
    .update(payments)
    .set({ userId, matchedBy: "manual", appliedAt: new Date(), updatedAt: new Date() })
    .where(sql`${payments.id} = ${paymentId} AND ${payments.appliedAt} IS NULL`)
    .returning({ id: payments.id });
  if (!claimed[0]) return false;
  await grantAccessDays(userId, days);
  return true;
}

/** Записать уведомление как есть. Ошибка записи не должна ронять ответ. */
export async function recordEvent(input: {
  provider: string;
  verified: boolean;
  eventType: string | null;
  externalId: string | null;
  raw: unknown;
  headers: Record<string, string>;
  outcome: string;
  note?: string | null;
}): Promise<void> {
  try {
    await getDb().insert(paymentEvents).values({
      provider: input.provider,
      verified: input.verified,
      eventType: input.eventType,
      externalId: input.externalId,
      raw: input.raw as Record<string, unknown>,
      headers: input.headers,
      outcome: input.outcome,
      note: input.note ?? null,
    });
  } catch (error) {
    // Уведомление уже обработано; потерянная строка журнала хуже молчания,
    // но несравнимо лучше отказа, из-за которого Tribute пришлёт повтор.
    console.error("не записалось событие оплаты", error);
  }
}

export type PaymentRow = {
  id: number;
  provider: string;
  externalId: string;
  userId: number | null;
  email: string | null;
  sum: string;
  status: string;
  tariff: string | null;
  matchedBy: string | null;
  appliedAt: Date | null;
  createdAt: Date;
};

export async function listPayments(limit = 100): Promise<PaymentRow[]> {
  return getDb()
    .select({
      id: payments.id,
      provider: payments.provider,
      externalId: payments.externalId,
      userId: payments.userId,
      email: users.email,
      sum: payments.sum,
      status: payments.status,
      tariff: payments.tariff,
      matchedBy: payments.matchedBy,
      appliedAt: payments.appliedAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

export type EventRow = {
  id: number;
  verified: boolean;
  eventType: string | null;
  externalId: string | null;
  outcome: string;
  note: string | null;
  raw: unknown;
  createdAt: Date;
};

export async function listPaymentEvents(limit = 30): Promise<EventRow[]> {
  return getDb()
    .select({
      id: paymentEvents.id,
      verified: paymentEvents.verified,
      eventType: paymentEvents.eventType,
      externalId: paymentEvents.externalId,
      outcome: paymentEvents.outcome,
      note: paymentEvents.note,
      raw: paymentEvents.raw,
      createdAt: paymentEvents.createdAt,
    })
    .from(paymentEvents)
    .orderBy(desc(paymentEvents.createdAt))
    .limit(limit);
}

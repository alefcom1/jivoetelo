/**
 * Приглашения: база. Правила и разбор ссылки — в lib/referral.ts.
 */

import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/db";
import { pendingInvites, users } from "@/db/schema";
import { isReferralCode, makeReferralCode } from "./referral.ts";

/**
 * Код приглашения человека. Заводится при первом обращении.
 *
 * Столкновения кодов маловероятны (32^8), но не невозможны, и полагаться на
 * «маловероятно» в уникальном индексе нельзя: одна ошибка вставки — и человек
 * видит сломанную кнопку. Поэтому несколько попыток, а не одна.
 */
export async function ensureReferralCode(userId: number): Promise<string> {
  const db = getDb();
  const existing = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
  const current = existing[0]?.code;
  if (isReferralCode(current)) return current;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeReferralCode();
    try {
      // Условие `referral_code IS NULL` в WHERE, а не проверка выше: между
      // чтением и записью человек мог нажать «Позвать друга» во второй
      // вкладке, и второй код затёр бы первый — вместе с уже разосланными
      // ссылками.
      const updated = await db
        .update(users)
        .set({ referralCode: code })
        .where(and(eq(users.id, userId), isNull(users.referralCode)))
        .returning({ code: users.referralCode });
      if (updated[0]?.code) return updated[0].code;

      // Не обновилось — значит код уже кто-то поставил. Читаем его.
      const again = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
      if (isReferralCode(again[0]?.code)) return again[0].code!;
    } catch {
      // Столкновение по уникальному индексу — пробуем другой код.
    }
  }
  throw new Error("Не удалось выдать код приглашения");
}

/** Кто пригласил — по коду из ссылки. */
export async function inviterByCode(code: string): Promise<number | null> {
  if (!isReferralCode(code)) return null;
  const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Запомнить приглашение до регистрации.
 *
 * Перезаписываем на последнее: если человек прошёл по двум разным ссылкам, то
 * привёл его тот, чья ссылка сработала последней и после которой он завёл
 * аккаунт. Копить историю переходов ради этого незачем.
 */
export async function rememberInvite(telegramUserId: string, code: string): Promise<void> {
  const inviterId = await inviterByCode(code);
  if (!inviterId) return;
  await getDb()
    .insert(pendingInvites)
    .values({ telegramUserId, inviterId })
    .onConflictDoUpdate({ target: pendingInvites.telegramUserId, set: { inviterId } });
}

/**
 * Привязать отложенное приглашение к только что заведённому аккаунту.
 *
 * Само себя пригласить нельзя: человек может открыть собственную ссылку,
 * чтобы посмотреть, как она выглядит, — и это не повод записать его себе в
 * приглашённые.
 */
export async function applyPendingInvite(userId: number, telegramUserId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ inviterId: pendingInvites.inviterId })
    .from(pendingInvites)
    .where(eq(pendingInvites.telegramUserId, telegramUserId))
    .limit(1);
  const inviterId = rows[0]?.inviterId;
  if (!inviterId || inviterId === userId) return;

  // Только если ещё не проставлено: пригласивший у человека один и навсегда.
  await db
    .update(users)
    .set({ invitedBy: inviterId })
    .where(and(eq(users.id, userId), isNull(users.invitedBy)));
  await db.delete(pendingInvites).where(eq(pendingInvites.telegramUserId, telegramUserId));
}

/** Сколько человек пришло по приглашению. Показывается самому пригласившему. */
export async function invitedCount(userId: number): Promise<number> {
  const rows = await getDb().select({ id: users.id }).from(users).where(eq(users.invitedBy, userId));
  return rows.length;
}

/**
 * Сколько дней дневника должен провести приглашённый, чтобы награда
 * начислилась обоим.
 *
 * Семь, а не ноль: награда в день регистрации — это способ накрутить доступ
 * ботами, а не привести живого человека. Семь дней с записями отличает
 * пришедшего от заведённого.
 */
export const REFERRAL_REWARD_AFTER_DAYS = 7;

/** Сколько дней доступа получает каждый. */
export const REFERRAL_REWARD_DAYS = 30;

export type ReferralReward = { rewarded: true; days: number } | { rewarded: false };

/**
 * Начислить награду за приглашение, если пора.
 *
 * Вызывается при обычной загрузке «Сегодня» — там уже посчитаны дни с
 * записями, и отдельного обхода по расписанию не нужно. Cron здесь был бы
 * лишней движущейся частью: начислять некому, пока человек не зашёл.
 *
 * Однократность обеспечивает не проверка в коде, а `IS NULL` прямо в WHERE:
 * человек может открыть «Сегодня» в вебе и в Mini App одновременно, и обе
 * загрузки увидят одинаковое состояние.
 */
export async function rewardReferralIfDue(
  userId: number,
  loggedDays: number,
  now = new Date(),
): Promise<ReferralReward> {
  if (loggedDays < REFERRAL_REWARD_AFTER_DAYS) return { rewarded: false };

  const db = getDb();
  const claimed = await db
    .update(users)
    .set({ referralRewardedAt: now })
    .where(and(eq(users.id, userId), isNull(users.referralRewardedAt)))
    .returning({ inviterId: users.invitedBy });
  const row = claimed[0];
  // Не обновилось — награда уже начислена. Нет пригласившего — начислять не
  // за что, но отметку всё равно ставим: иначе этот запрос будет выполняться
  // при каждой загрузке экрана до конца времён.
  if (!row) return { rewarded: false };
  if (!row.inviterId) return { rewarded: false };

  const { grantAccessDays } = await import("./vouchers-store.ts");
  await grantAccessDays(userId, REFERRAL_REWARD_DAYS, now);
  await grantAccessDays(row.inviterId, REFERRAL_REWARD_DAYS, now);
  return { rewarded: true, days: REFERRAL_REWARD_DAYS };
}

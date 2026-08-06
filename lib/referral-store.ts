/**
 * Реферальные ссылки в базе. Разбор самой ссылки — в lib/referral.ts, там
 * чисто и без Postgres.
 *
 * Три операции, и все три идемпотентны, потому что каждая может прийти
 * дважды: человек нажимает /start повторно, открывает ссылку с двух
 * устройств, регистрируется после нескольких заходов.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { referralVisits, users } from "@/db/schema";
import { generateReferralCode } from "./referral.ts";

/** Сколько раз пробуем выдать код при столкновении. Шанс дойти до третьей — исчезающий. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Код пользователя, при необходимости выдавая новый.
 *
 * Гонку решает уникальный индекс, а не проверка перед вставкой: два
 * одновременных `/invite` с двух устройств прошли бы любую проверку и
 * записали бы разные коды. Здесь второй запрос упрётся в индекс, перечитает
 * строку и вернёт то, что записал первый.
 */
export async function ensureReferralCode(userId: number): Promise<string> {
  const db = getDb();

  const existing = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
  if (existing[0]?.code) return existing[0].code;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateReferralCode();
    const updated = await db
      .update(users)
      // WHERE referral_code IS NULL: если код успели выдать между нашим
      // чтением и записью, мы не должны его перетереть — ссылку с прежним
      // кодом человек мог уже отправить.
      .set({ referralCode: code })
      .where(sql`${users.id} = ${userId} AND ${users.referralCode} IS NULL`)
      .returning({ code: users.referralCode });

    if (updated[0]?.code) return updated[0].code;

    const now = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
    if (now[0]?.code) return now[0].code;
    // Код занят другим пользователем — пробуем ещё раз с новым.
  }

  throw new Error("referral code generation failed");
}

/**
 * Запоминает переход по чужой ссылке до регистрации.
 *
 * Первый пришедший выигрывает: если человек походил по ссылкам троих, засчитан
 * будет тот, кого он открыл первым. Иначе приглашение превратилось бы в гонку,
 * где выигрывает последний написавший, — а это ровно тот сценарий, при котором
 * ссылками начинают спамить.
 */
export async function rememberReferralVisit(telegramUserId: string, code: string): Promise<boolean> {
  const db = getDb();
  const referrer = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
  if (!referrer[0]) return false;

  // Уже есть аккаунт — приглашать некого: реферал засчитывается только новым.
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramUserId, telegramUserId))
    .limit(1);
  // Сюда же попадает и случай «открыл собственную ссылку»: аккаунт у него
  // есть, значит приглашать некого.
  if (existingUser[0]) return false;

  await db
    .insert(referralVisits)
    .values({ telegramUserId, referrerUserId: referrer[0].id })
    .onConflictDoNothing();
  return true;
}

/**
 * Привязывает приглашение к только что созданному аккаунту.
 *
 * Вызывается из обоих мест, где заводится аккаунт по Telegram (Mini App и
 * вход на сайте): забыть одно из них означало бы, что половина приглашений
 * не считается, и понять это можно только сверив две цифры вручную.
 *
 * Никогда не бросает: несосчитанный реферал — не повод не создать аккаунт.
 */
export async function claimReferral(userId: number, telegramUserId: string): Promise<void> {
  try {
    const db = getDb();
    const visit = await db
      .select({ referrerUserId: referralVisits.referrerUserId })
      .from(referralVisits)
      .where(eq(referralVisits.telegramUserId, telegramUserId))
      .limit(1);

    const referrerUserId = visit[0]?.referrerUserId;
    if (!referrerUserId || referrerUserId === userId) return;

    await db
      .update(users)
      // Только если ещё не проставлено: пригласивший назначается один раз.
      .set({ referredBy: referrerUserId })
      .where(sql`${users.id} = ${userId} AND ${users.referredBy} IS NULL`);

    await db.delete(referralVisits).where(eq(referralVisits.telegramUserId, telegramUserId));
  } catch (error) {
    console.error("claim referral failed", error);
  }
}

/** Сколько человек пришло по ссылке и завело аккаунт. */
export async function countReferrals(userId: number): Promise<number> {
  const rows = (await getDb().execute(
    sql`SELECT COUNT(*)::int AS value FROM users WHERE referred_by = ${userId}`,
  )) as unknown as { rows: Array<{ value: number }> };
  return rows.rows?.[0]?.value ?? 0;
}

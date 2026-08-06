/**
 * Боевая реализация BotStore: связывает разбор апдейтов с базой и диском.
 * Отдельный файл нужен, чтобы сам разбор (handle-update.ts) оставался
 * проверяемым без Postgres.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { botPreferences, users, weightEntries } from "@/db/schema";
import { botLink } from "../bot-public.ts";
import { addToInbox, countInboxToday, countPendingOnDay } from "../inbox.ts";
import { getDaySummary } from "../meals.ts";
import { countReferrals, ensureReferralCode, rememberReferralVisit } from "../referral-store.ts";
import { referralPayload } from "../referral.ts";
import { getSpeechProvider, isSpeechEnabled } from "../speech/index.ts";
import { savePhoto } from "../storage.ts";
import { consumeLinkCode, findUserByTelegram } from "../telegram.ts";
import { formatKgChange, weeklyTrendChange, weightTrend } from "../trend.ts";
import { listRecentWeights } from "../weight.ts";
import type { BotDeps, BotStore } from "./handle-update.ts";

/**
 * Создаёт строку настроек, если её ещё нет, и применяет изменение. Настройки
 * заводятся лениво: у большинства пользователей они никогда не отличаются от
 * умолчаний, и создавать строку при регистрации незачем.
 */
async function upsertPreferences(
  userId: number,
  values: Partial<{
    remindersEnabled: boolean;
    snoozedUntil: Date | null;
    digestHour: number;
    weighRemindersEnabled: boolean;
  }>,
): Promise<void> {
  await getDb()
    .insert(botPreferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: botPreferences.userId,
      set: { ...values, updatedAt: sql`now()` },
    });
}

export const botStore: BotStore = {
  async findUserByTelegram(telegramUserId) {
    const user = await findUserByTelegram(telegramUserId);
    return user ? { id: user.id } : null;
  },

  async linkByCode(code, telegramUserId) {
    const user = await consumeLinkCode(code, telegramUserId);
    return user ? { id: user.id } : null;
  },

  countInboxToday,
  savePhoto,

  async addToInbox(input) {
    await addToInbox(input);
  },

  async setRemindersEnabled(userId, enabled) {
    await upsertPreferences(userId, { remindersEnabled: enabled, snoozedUntil: null });
  },

  async snoozeReminders(userId, until) {
    await upsertPreferences(userId, { snoozedUntil: until });
  },

  async setWeighRemindersEnabled(userId, enabled) {
    await upsertPreferences(userId, { weighRemindersEnabled: enabled });
  },

  /**
   * Замер за день — тот же upsert, что в приложении
   * (app/api/tg/profile/weight): второе число за сутки заменяет первое, а не
   * добавляется. Иначе «встал на весы, не понравилось, встал ещё раз» дало бы
   * два замера, из которых тренд посчитал бы среднее по настроению.
   */
  async saveWeight(userId, day, weightKg) {
    await getDb()
      .insert(weightEntries)
      .values({ userId, onDate: day, weightKg })
      .onConflictDoUpdate({
        target: [weightEntries.userId, weightEntries.onDate],
        set: { weightKg },
      });

    const points = await listRecentWeights(userId, 60);
    const change = weeklyTrendChange(weightTrend(points));
    if (change === null) return null;
    return `Тренд за неделю: ${formatKgChange(change)}.`;
  },

  async daySummary(userId, day) {
    const [summary, pendingPhotos, showCalories] = await Promise.all([
      getDaySummary(userId, day),
      countPendingOnDay(userId, day),
      readShowCalories(userId),
    ]);

    return {
      totals: summary.totals,
      targets: summary.targets,
      mealsCount: summary.meals.length,
      pendingPhotos,
      showCalories,
    };
  },

  async referral(userId) {
    const [code, joined] = await Promise.all([ensureReferralCode(userId), countReferrals(userId)]);
    return { link: botLink(referralPayload(code)), joined };
  },

  async rememberReferral(telegramUserId, code) {
    await rememberReferralVisit(telegramUserId, code);
  },

  async plan(userId) {
    const rows = await getDb().select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
    return rows[0]?.plan === "premium" ? "premium" : "free";
  },
};

/** Режим «скрыть калории»: итог дня обязан его уважать так же, как экраны. */
async function readShowCalories(userId: number): Promise<boolean> {
  const rows = await getDb().select({ showCalories: users.showCalories }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.showCalories ?? true;
}

/**
 * Расшифровка голосовых для бота — или `null`, когда её нет.
 *
 * Возвращать `null`, а не провайдера, который всегда отказывает: бот по этому
 * значению решает, качать ли файл. Отличать «выключено» от «сломалось» после
 * загрузки мегабайта — значит тратить трафик на заведомо известный ответ.
 */
export function botTranscriber(): BotDeps["transcribe"] {
  if (!isSpeechEnabled()) return null;
  const provider = getSpeechProvider();
  return (input) => provider.transcribe(input);
}

/** Настройки бота для веб-интерфейса. Отсутствие строки — это умолчания. */
export async function getBotPreferences(userId: number) {
  const rows = await getDb().select().from(botPreferences).where(eq(botPreferences.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export { upsertPreferences };

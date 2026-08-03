/**
 * Боевая реализация BotStore: связывает разбор апдейтов с базой и диском.
 * Отдельный файл нужен, чтобы сам разбор (handle-update.ts) оставался
 * проверяемым без Postgres.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { botPreferences } from "@/db/schema";
import { addToInbox, countInboxToday } from "../inbox.ts";
import { getSpeechProvider, isSpeechEnabled } from "../speech/index.ts";
import { savePhoto } from "../storage.ts";
import { consumeLinkCode, findUserByTelegram } from "../telegram.ts";
import type { BotDeps, BotStore } from "./handle-update.ts";

/**
 * Создаёт строку настроек, если её ещё нет, и применяет изменение. Настройки
 * заводятся лениво: у большинства пользователей они никогда не отличаются от
 * умолчаний, и создавать строку при регистрации незачем.
 */
async function upsertPreferences(
  userId: number,
  values: Partial<{ remindersEnabled: boolean; snoozedUntil: Date | null; digestHour: number }>,
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
};

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

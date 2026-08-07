import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramLinkCodes, users } from "@/db/schema";
import type { CurrentUser } from "./auth.ts";
import { effectivePlan } from "./paid.ts";

// Проверка подписей вынесена в ./telegram-auth.ts: там чистая криптография
// без базы, и её можно проверять тестами. Здесь — всё, что ходит в БД.
// Реэкспорт оставлен, чтобы места вызова не переписывать: снаружи модуль
// по-прежнему выглядит одним целым.
export {
  botUsername,
  TelegramAuthError,
  verifyInitData,
  verifyLoginWidget,
  type TelegramIdentity,
  type TelegramLoginData,
} from "./telegram-auth.ts";

import { TelegramAuthError, verifyInitData } from "./telegram-auth.ts";

const LINK_CODE_TTL_MINUTES = 15;

/** Находит пользователя сервиса по привязанному Telegram-аккаунту. */
export async function findUserByTelegram(telegramUserId: string): Promise<CurrentUser | null> {
  const rows = await getDb()
    .select({ id: users.id, email: users.email, showCalories: users.showCalories, simpleMode: users.simpleMode, firstRunHints: users.firstRunHints, accessUntil: users.accessUntil, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.telegramUserId, telegramUserId))
    .limit(1);
  const row = rows[0];
  // Пользователь найден по самой привязке — она заведомо есть.
  // Тариф вычисляется из срока — как в lib/auth.ts, одним способом на обе
  // точки входа.
  return row ? { ...row, plan: effectivePlan(row.accessUntil, row.createdAt, new Date()), telegramLinked: true } : null;
}

/** Разбирает initData и возвращает пользователя; бросает not_linked, если привязки нет. */
export async function resolveTelegramUser(initData: string): Promise<CurrentUser> {
  const identity = verifyInitData(initData);
  const user = await findUserByTelegram(identity.telegramUserId);
  if (!user) throw new TelegramAuthError("not_linked");
  return user;
}

/** Создаёт одноразовый код привязки в веб-профиле. */
export async function createLinkCode(userId: number): Promise<{ code: string; expiresAt: Date }> {
  const db = getDb();
  const now = new Date();
  // Старые неиспользованные коды гасим, чтобы активным был только последний.
  await db
    .update(telegramLinkCodes)
    .set({ expiresAt: now })
    .where(and(eq(telegramLinkCodes.userId, userId), isNull(telegramLinkCodes.usedAt)));

  const code = randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MINUTES * 60 * 1000);
  await db.insert(telegramLinkCodes).values({ code, userId, expiresAt });
  return { code, expiresAt };
}

/**
 * Привязывает Telegram-аккаунт по одноразовому коду. Возвращает пользователя
 * или null, если код неизвестен, просрочен или уже использован.
 */
export async function consumeLinkCode(code: string, telegramUserId: string): Promise<CurrentUser | null> {
  const db = getDb();
  const normalized = code.trim().toUpperCase();
  const rows = await db
    .select({ userId: telegramLinkCodes.userId })
    .from(telegramLinkCodes)
    .where(
      and(
        eq(telegramLinkCodes.code, normalized),
        isNull(telegramLinkCodes.usedAt),
        gt(telegramLinkCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Один Telegram-аккаунт — один пользователь сервиса.
  const taken = await findUserByTelegram(telegramUserId);
  if (taken && taken.id !== row.userId) return null;

  await db.update(users).set({ telegramUserId }).where(eq(users.id, row.userId));
  await db.update(telegramLinkCodes).set({ usedAt: new Date() }).where(eq(telegramLinkCodes.code, normalized));

  const linked = await db
    .select({ id: users.id, email: users.email, showCalories: users.showCalories, simpleMode: users.simpleMode, firstRunHints: users.firstRunHints, accessUntil: users.accessUntil, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  const linkedRow = linked[0];
  // Код привязки только что применён к этому аккаунту — привязка есть.
  return linkedRow
    ? { ...linkedRow, plan: effectivePlan(linkedRow.accessUntil, linkedRow.createdAt, new Date()), telegramLinked: true }
    : null;
}

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { validate } from "@telegram-apps/init-data-node";
import { getDb } from "@/db";
import { telegramLinkCodes, users } from "@/db/schema";
import type { CurrentUser } from "./auth.ts";

// Проверка initData Telegram (раздел 17 спеки: «не доверять данным клиента
// без серверной проверки»). Используем официальную библиотеку @telegram-apps:
// она считает HMAC-SHA256 с ключом WebAppData и проверяет срок жизни подписи.

const INIT_DATA_TTL_SECONDS = 3600;
const LINK_CODE_TTL_MINUTES = 15;

export type TelegramIdentity = {
  telegramUserId: string;
  firstName: string | null;
};

export class TelegramAuthError extends Error {
  readonly reason: "not_configured" | "invalid_signature" | "not_linked";

  constructor(reason: "not_configured" | "invalid_signature" | "not_linked", message?: string) {
    super(message ?? reason);
    this.reason = reason;
  }
}

/** Проверяет подпись initData и возвращает идентичность Telegram-пользователя. */
export function verifyInitData(initData: string): TelegramIdentity {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramAuthError("not_configured");

  try {
    validate(initData, token, { expiresIn: INIT_DATA_TTL_SECONDS });
  } catch {
    throw new TelegramAuthError("invalid_signature");
  }

  // Подлинность уже подтверждена validate(); поле user разбираем сами, чтобы
  // не зависеть от строгой схемы библиотеки (Telegram добавляет поля со временем).
  let tgUser: { id?: number; first_name?: string };
  try {
    tgUser = JSON.parse(new URLSearchParams(initData).get("user") ?? "{}");
  } catch {
    throw new TelegramAuthError("invalid_signature");
  }
  if (!tgUser?.id) throw new TelegramAuthError("invalid_signature");

  return { telegramUserId: String(tgUser.id), firstName: tgUser.first_name ?? null };
}

/** Находит пользователя сервиса по привязанному Telegram-аккаунту. */
export async function findUserByTelegram(telegramUserId: string): Promise<CurrentUser | null> {
  const rows = await getDb()
    .select({ id: users.id, email: users.email, showCalories: users.showCalories })
    .from(users)
    .where(eq(users.telegramUserId, telegramUserId))
    .limit(1);
  return rows[0] ?? null;
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
    .select({ id: users.id, email: users.email, showCalories: users.showCalories })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  return linked[0] ?? null;
}

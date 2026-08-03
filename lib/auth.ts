import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { normalizePlan, type Plan } from "./quota-policy.ts";

const SESSION_COOKIE = "jt_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: number;
  /** null у аккаунта из Mini App: там почты нет и не требуется. */
  email: string | null;
  showCalories: boolean;
  /** Тариф. Сейчас у всех "free" — все функции доступны бесплатно. */
  plan: Plan;
  /**
   * Привязан ли Telegram. Именно флаг, а не сам идентификатор: он нужен
   * интерфейсу и аналитике, а таскать по коду чужой числовой идентификатор
   * ради ответа «да/нет» незачем.
   */
  telegramLinked: boolean;
  /** Упрощённый режим учёта: тарелка вместо чисел (lib/simple-log.ts). */
  simpleMode: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Создаёт сессию и ставит cookie. Вызывать только из server actions / route handlers. */
export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getDb().insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      showCalories: users.showCalories,
      plan: users.plan,
      simpleMode: users.simpleMode,
      telegramUserId: users.telegramUserId,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const { telegramUserId, ...user } = row;
  return { ...user, plan: normalizePlan(row.plan), telegramLinked: telegramUserId !== null };
}

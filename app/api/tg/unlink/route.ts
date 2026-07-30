import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { authorize } from "../_auth";

/**
 * Отвязка Telegram-аккаунта — «выход» в терминах Mini App. Своей сессии
 * здесь нет (авторизация идёт по initData при каждом запросе), поэтому выйти
 * означает разорвать саму привязку: следующий запуск потребует новый код,
 * который выдаётся в веб-настройках.
 */
export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  await getDb().update(users).set({ telegramUserId: null }).where(eq(users.id, auth.user.id));
  return Response.json({ ok: true });
}

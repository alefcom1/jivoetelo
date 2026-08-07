import { getDb } from "@/db";
import { userConsents, users } from "@/db/schema";
import { applyPendingInvite } from "@/lib/referral-store";
import { LEGAL_VERSION } from "@/lib/legal";
import { findUserByTelegram, TelegramAuthError, verifyInitData } from "@/lib/telegram";

/**
 * Заводит аккаунт прямо в Mini App — без почты и пароля.
 *
 * ## Зачем
 *
 * До этого человек, нашедший бота в Telegram, чтобы начать пользоваться
 * дневником, проходил пять шагов и два переключения между приложениями:
 * уйти на сайт, зарегистрироваться, найти в настройках код, вернуться в
 * Telegram, ввести код. На каждом переходе часть людей просто не доходила.
 *
 * ## Почему это безопасно
 *
 * Личность подтверждает подпись `initData`, которую ставит сам Telegram
 * ключом бота: проверив её, мы знаем идентификатор пользователя не хуже, чем
 * знали бы по паролю. Пароль тут ничего не добавил бы — он защищает от того,
 * кто знает чужой логин, а логина здесь нет вовсе.
 *
 * ## Согласия
 *
 * Записываются те же два, что и при веб-регистрации, с той же версией
 * документов и пометкой источника `telegram`. Без явного согласия аккаунт не
 * заводится: галочку на экране проверяет не только браузер, но и этот код —
 * запрос можно послать и мимо интерфейса.
 */
export async function POST(request: Request) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) return Response.json({ reason: "invalid_signature" }, { status: 401 });

  let telegramUserId: string;
  try {
    ({ telegramUserId } = verifyInitData(initData));
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return Response.json({ reason: error.reason }, { status: error.reason === "not_configured" ? 503 : 401 });
    }
    console.error("tg register verify failed", error);
    return Response.json({ reason: "error" }, { status: 500 });
  }

  let consent: unknown;
  try {
    ({ consent } = (await request.json()) as { consent?: unknown });
  } catch {
    return Response.json({ reason: "no_consent" }, { status: 400 });
  }
  if (consent !== true) return Response.json({ reason: "no_consent" }, { status: 400 });

  // Повторный запрос — не ошибка: человек мог нажать дважды или вернуться на
  // экран, пока предыдущий ответ шёл. Отдаём тот же успех, что и в первый раз.
  const existing = await findUserByTelegram(telegramUserId);
  if (existing) return Response.json({ ok: true, created: false });

  try {
    const db = getDb();
    const inserted = await db
      .insert(users)
      .values({ telegramUserId })
      // Если между проверкой выше и вставкой аккаунт успел появиться (два
      // запроса подряд), уникальный индекс по telegram_user_id это поймает,
      // и мы отдадим успех, а не ошибку.
      .onConflictDoNothing()
      .returning({ id: users.id });

    if (inserted.length === 0) return Response.json({ ok: true, created: false });
    const userId = inserted[0].id;

    await db.insert(userConsents).values([
      { userId, kind: "terms", version: LEGAL_VERSION, source: "telegram" },
      { userId, kind: "ai_processing", version: LEGAL_VERSION, source: "telegram" },
    ]);

    /**
     * Приглашение, запомненное ботом при переходе по ссылке друга. Именно
     * здесь ему и место: до этой строки аккаунта не существовало, а к
     * следующей загрузке экрана оно уже никому не видно.
     *
     * Сбой не должен ронять регистрацию: человек пришёл завести дневник, а не
     * поучаствовать в чьей-то статистике приглашений.
     */
    await applyPendingInvite(userId, telegramUserId).catch((error) => {
      console.error("tg register: не удалось привязать приглашение", error);
    });

    return Response.json({ ok: true, created: true });
  } catch (error) {
    console.error("tg register failed", error);
    return Response.json({ reason: "error" }, { status: 500 });
  }
}

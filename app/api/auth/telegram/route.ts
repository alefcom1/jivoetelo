import { getDb } from "@/db";
import { userConsents, users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { LEGAL_VERSION } from "@/lib/legal";
import { applyPendingInvite } from "@/lib/referral-store";
import {
  findUserByTelegram,
  TelegramAuthError,
  verifyLoginWidget,
  type TelegramLoginData,
} from "@/lib/telegram";

/**
 * Вход на сайт через Telegram.
 *
 * ## Почему POST, а не переход по ссылке
 *
 * У виджета Telegram два режима: перенаправление на наш адрес с полями в
 * строке запроса и вызов функции в браузере. Взят второй, и данные приходят
 * сюда телом POST. Причина простая: адреса попадают в журналы сервера, в
 * историю браузера и в заголовок Referer при следующем переходе, а здесь по
 * ним можно войти в чужой аккаунт в течение часа. Тело запроса никуда не
 * записывается.
 *
 * ## Что здесь проверяется
 *
 * Подпись — ключом бота (см. verifyLoginWidget; она считается не так, как у
 * Mini App, и это отдельная ловушка). Давность — там же: подпись верна вечно,
 * и без проверки времени однажды подсмотренный ответ работал бы как пароль
 * без срока.
 *
 * ## Почему новый аккаунт заводится только с согласиями
 *
 * По 152-ФЗ согласие на обработку данных о питании и весе даёт человек, а не
 * галочка в чужом интерфейсе. Поэтому вход и регистрация здесь — разные
 * случаи: если привязанного аккаунта нет, а согласий в запросе нет, отвечаем
 * `needs_consent`, и страница показывает те же два согласия, что и обычная
 * регистрация. Молча завести аккаунт по одному нажатию нельзя.
 */
export async function POST(request: Request) {
  let payload: { data?: unknown; consent?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ reason: "invalid_signature" }, { status: 400 });
  }

  // Принимаем только плоский объект строк — ровно то, что отдаёт виджет.
  // Вложенные структуры в строку подписи не превратить, и пытаться незачем.
  const raw = payload.data;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return Response.json({ reason: "invalid_signature" }, { status: 400 });
  }
  const data: TelegramLoginData = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") data[key] = value;
    else if (typeof value === "number") data[key] = String(value);
    else return Response.json({ reason: "invalid_signature" }, { status: 400 });
  }

  let telegramUserId: string;
  try {
    ({ telegramUserId } = verifyLoginWidget(data));
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      return Response.json({ reason: error.reason }, { status: error.reason === "not_configured" ? 503 : 401 });
    }
    console.error("telegram login verify failed", error);
    return Response.json({ reason: "error" }, { status: 500 });
  }

  const existing = await findUserByTelegram(telegramUserId);
  if (existing) {
    await createSession(existing.id);
    return Response.json({ ok: true, created: false });
  }

  if (payload.consent !== true) {
    return Response.json({ reason: "needs_consent" }, { status: 409 });
  }

  try {
    const db = getDb();
    // Аккаунт без почты и пароля — такой же, как заводит Mini App. Личность
    // подтверждена подписью Telegram; пароль защищает от того, кто знает
    // чужой логин, а логина здесь нет вовсе.
    const inserted = await db.insert(users).values({ telegramUserId }).returning({ id: users.id });
    const userId = inserted[0].id;
    await db.insert(userConsents).values([
      { userId, kind: "terms", version: LEGAL_VERSION, source: "telegram" },
      { userId, kind: "ai_processing", version: LEGAL_VERSION, source: "telegram" },
    ]);
    // Второй из двух входов, где заводится аккаунт по Telegram (первый —
    // app/api/tg/register). Приглашение привязывается и здесь: человек мог
    // прийти по ссылке друга, но завести аккаунт не в Mini App, а на сайте
    // кнопкой «Войти через Telegram», — и тогда приглашение просто пропадало.
    // Не роняем регистрацию: несосчитанный реферал дешевле незаведённого
    // аккаунта.
    await applyPendingInvite(userId, telegramUserId).catch((error) => {
      console.error("apply pending invite failed", error);
    });
    await createSession(userId);
    return Response.json({ ok: true, created: true });
  } catch (error) {
    console.error("telegram login register failed", error);
    return Response.json({ reason: "error" }, { status: 500 });
  }
}

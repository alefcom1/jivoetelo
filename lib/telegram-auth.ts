import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { validate } from "@telegram-apps/init-data-node";

/**
 * Проверка подписей Telegram — без базы и без всего остального.
 *
 * Отдельный модуль, потому что это чистая криптография и потому что её надо
 * проверять тестами. Пока она жила рядом с запросами к базе, тест не мог её
 * даже импортировать: модуль тянул за собой подключение к БД. А проверять
 * код входа особенно важно — ошибка здесь пускает в чужой аккаунт.
 *
 * Здесь два разных механизма Telegram с похожими на вид данными:
 * `initData` у Mini App и Login Widget у кнопки на сайте. Подписи у них
 * считаются по-разному, и перепутать легко — см. verifyLoginWidget.
 */

const INIT_DATA_TTL_SECONDS = 3600;

export type TelegramIdentity = {
  telegramUserId: string;
  firstName: string | null;
  /**
   * Аватар в Telegram — только у initData Mini App и только если человек не
   * закрыл фото настройками приватности. У Login Widget его нет, поэтому
   * поле необязательное.
   */
  photoUrl?: string | null;
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
  let tgUser: { id?: number; first_name?: string; photo_url?: string };
  try {
    tgUser = JSON.parse(new URLSearchParams(initData).get("user") ?? "{}");
  } catch {
    throw new TelegramAuthError("invalid_signature");
  }
  if (!tgUser?.id) throw new TelegramAuthError("invalid_signature");

  return {
    telegramUserId: String(tgUser.id),
    firstName: tgUser.first_name ?? null,
    // Адрес аватара в Telegram. Приходит не всегда — зависит от настроек
    // приватности человека. Само по себе это поле в интерфейс не идёт: по
    // нему картинку один раз скачивают на сервере и кладут своим файлом
    // (app/api/tg/avatar), чтобы в интерфейсе не оказалось внешнего хоста.
    photoUrl: typeof tgUser.photo_url === "string" ? tgUser.photo_url : null,
  };
}

/**
 * Кнопка «Войти через Telegram» на сайте — это НЕ initData.
 *
 * Два разных механизма с похожими на вид данными, и подписи у них считаются
 * по-разному. Перепутать легко, а последствие у путаницы одно: проверка,
 * которая всегда говорит «нет», либо, что хуже, всегда «да».
 *
 * | | Mini App (`initData`) | Login Widget |
 * |---|---|---|
 * | ключ HMAC | `HMAC_SHA256("WebAppData", токен)` | `SHA256(токен)` |
 * | что подписано | строка запроса | плоский объект полей |
 *
 * Строка для подписи — оставшиеся поля в виде `ключ=значение`, отсортированные
 * по имени и склеенные переводом строки. Поле `hash` в неё, разумеется, не
 * входит.
 *
 * `auth_date` проверяем сами: подпись верна вечно, и без проверки давности
 * однажды подсмотренный ответ Telegram работал бы как пароль без срока.
 */
const LOGIN_WIDGET_TTL_SECONDS = 3600;

export type TelegramLoginData = Record<string, string>;

export function verifyLoginWidget(data: TelegramLoginData, now = new Date()): TelegramIdentity {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramAuthError("not_configured");

  const { hash, ...fields } = data;
  if (!hash) throw new TelegramAuthError("invalid_signature");

  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");

  // Сравнение постоянного времени: обычное `!==` выходит из цикла на первом
  // несовпавшем байте, и по времени ответа хеш можно подобрать побайтово.
  const given = Buffer.from(hash, "hex");
  const want = Buffer.from(expected, "hex");
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new TelegramAuthError("invalid_signature");
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate)) throw new TelegramAuthError("invalid_signature");
  const age = Math.floor(now.getTime() / 1000) - authDate;
  // Отрицательный возраст — часы клиента впереди наших; небольшой запас на это
  // нужен, но ответ «из будущего» на час вперёд означает подделку времени.
  if (age > LOGIN_WIDGET_TTL_SECONDS || age < -LOGIN_WIDGET_TTL_SECONDS) {
    throw new TelegramAuthError("invalid_signature");
  }

  if (!fields.id) throw new TelegramAuthError("invalid_signature");
  return { telegramUserId: String(fields.id), firstName: fields.first_name ?? null };
}

/**
 * Имя бота для кнопки «Войти через Telegram» — без «@».
 *
 * Пусто или не задано — кнопки на страницах входа нет вовсе, и это верное
 * поведение: виджет с чужим именем бота молча не сработает, а человек будет
 * жать на него и не понимать, почему ничего не происходит.
 *
 * Отдельная переменная, а не разбор токена: имя бота в токене не записано.
 */
export function botUsername(): string | null {
  const name = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return name ? name : null;
}

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { siteUrl } from "../site.ts";

/**
 * Короткоживущая ссылка на снимок — для тех случаев, когда сам снимок до
 * модели не доезжает.
 *
 * ## Зачем это понадобилось
 *
 * Разбор фото не работал, и зонд (scripts/ai-probe.mjs) в конце концов
 * показал почему. Одна и та же картинка 64×64 с разным балластом:
 *
 *     тело 32 КБ  — ок за 2,9 с
 *     тело 35 КБ  — не доходит вовсе, обрыв через две с половиной минуты
 *
 * Те же 73 КБ на посторонние хосты уходят за полсекунды, а на адрес прокси
 * не уходят никак. То есть порог не у нашего канала и не у нашего кода — он
 * у конкретного направления Россия → прокси. Тарелка еды в 32 килобайта не
 * влезает ни в каком формате и ни при каком качестве: сжатие эту задачу не
 * решает в принципе.
 *
 * ## Что вместо этого
 *
 * Anthropic принимает картинку не только телом запроса, но и ссылкой —
 * `source: { type: "url" }`. Тогда наружу уходит два килобайта JSON, а
 * снимок модель скачивает с нашего сервера сама. Направление меняется на
 * входящее, а входящий канал заведомо жив: сайт открывается.
 *
 * ## Почему подпись, а не просто открытый адрес
 *
 * Скачивать будет чужой сервер без наших ключей — значит маршрут обязан
 * работать без авторизации. Но это снимки еды конкретных людей, и лежать
 * в открытом доступе они не могут. Отсюда подписанная ссылка: угадать её
 * нельзя, живёт она пять минут, и внутри неё лежит сам ключ файла — то
 * есть подобрать чужой снимок, меняя цифры в адресе, невозможно.
 */

/**
 * Пять минут. Ссылка нужна ровно на время одного запроса к модели: мы её
 * выписываем, отдаём в запрос, Anthropic скачивает картинку в ближайшие
 * секунды. Пять минут — это запас на медленный канал, а не срок хранения.
 */
const TTL_MS = 5 * 60_000;

let cachedKey: Buffer | null = null;

/**
 * Ключ подписи. По умолчанию — случайный, живёт вместе с процессом.
 *
 * Это сознательный выбор, а не упущение. Ссылки эфемерны по замыслу: они
 * нужны секунды и не переживают перезапуск ни в каком сценарии. Случайный
 * ключ значит, что подписывать нечем снаружи, хранить нечего и утекать
 * нечему — а перезапуск в худшем случае стоит одного неудавшегося разбора.
 *
 * PHOTO_LINK_SECRET понадобится, когда приложение поедет в несколько
 * экземпляров: тогда ссылку выписывает один, а отдаёт другой, и общий
 * ключ становится обязательным.
 */
function signingKey(): Buffer {
  if (cachedKey) return cachedKey;
  const configured = process.env.PHOTO_LINK_SECRET?.trim();
  cachedKey = configured ? Buffer.from(configured, "utf8") : randomBytes(32);
  return cachedKey;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** Токен вида `<база64(срок:ключ)>.<подпись>`. Точки в base64url нет — разделитель однозначен. */
export function signPhotoLink(photoKey: string, now: number = Date.now()): string {
  const payload = `${now + TTL_MS}:${photoKey}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload)}`;
}

/** Ключ файла из токена — или null, если подпись не сошлась либо срок вышел. */
export function verifyPhotoLink(token: string, now: number = Date.now()): string | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const encoded = token.slice(0, separator);
  const mac = token.slice(separator + 1);

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  // Сравнение постоянного времени: подпись проверяется на публичном
  // маршруте, и обычное сравнение строк подсказывало бы её побайтно.
  const expected = Buffer.from(sign(payload), "utf8");
  const given = Buffer.from(mac, "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const colon = payload.indexOf(":");
  if (colon <= 0) return null;
  const expires = Number(payload.slice(0, colon));
  if (!Number.isFinite(expires) || expires <= now) return null;
  return payload.slice(colon + 1) || null;
}

/**
 * Полный адрес, по которому модель заберёт снимок, — или null, если
 * ссылками пользоваться нельзя.
 *
 * Требование к схеме не формальное: чужой сервер пойдёт по этому адресу
 * из внешней сети, и `http://localhost:3000` из среды разработки для него
 * означает его собственный localhost. Пусть лучше в разработке работает
 * привычная отправка телом, чем ссылка в никуда.
 */
export function photoLinkFor(photoKey: string, now: number = Date.now()): string | null {
  let base: URL;
  try {
    base = new URL(siteUrl());
  } catch {
    return null;
  }
  if (base.protocol !== "https:") return null;
  return `${base.origin}/api/ai-photo/${signPhotoLink(photoKey, now)}`;
}

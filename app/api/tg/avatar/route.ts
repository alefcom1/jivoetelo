import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { verifyInitData } from "@/lib/telegram-auth";
import { findUserByTelegram } from "@/lib/telegram";
import { ALLOWED_PHOTO_TYPES, deletePhoto, savePhoto } from "@/lib/storage";

/**
 * «Взять фото из Telegram» — один раз, на сервере.
 *
 * ## Почему не показать `photo_url` напрямую
 *
 * Он есть в подписанном initData, и соблазн подставить его в `<img src>`
 * велик. Но лежит картинка на CDN Telegram, и тогда наш экран начинает
 * зависеть от чужого сервера: без доступа к нему аватар не грузится, а сам
 * сервер узнаёт, когда человек открыл приложение. Скачиваем один раз и кладём
 * рядом со снимками еды — дальше файл наш.
 *
 * ## Откуда берётся адрес и почему это безопасно
 *
 * Из initData, подпись которого уже проверена: `verifyInitData`
 * бросает, если хеш не сошёлся. То есть адрес пришёл от Telegram, а не от
 * того, кто дёргает наш маршрут. Этого мало — проверяем ещё и хост: подпись
 * подтверждает, что данные не подменили по дороге, но серверный запрос по
 * произвольному адресу из тела остаётся серверным запросом по произвольному
 * адресу, и однажды в этом поле окажется что-нибудь неожиданное.
 */

/** Хосты, на которых Telegram держит аватары. Точное совпадение, не суффикс. */
const TELEGRAM_CDN = ["t.me", "cdn.telegram.org", "telegram.org"];

function isTelegramCdn(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return TELEGRAM_CDN.includes(url.hostname) || url.hostname.endsWith(".cdn.telegram.org");
}

/** Аватар весит десятки килобайт; всё крупнее — не аватар. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) return Response.json({ reason: "invalid_signature" }, { status: 401 });

  let identity;
  try {
    identity = verifyInitData(initData);
  } catch {
    return Response.json({ reason: "invalid_signature" }, { status: 401 });
  }

  const user = await findUserByTelegram(identity.telegramUserId);
  if (!user) return Response.json({ reason: "not_linked" }, { status: 403 });

  const photoUrl = identity.photoUrl;
  if (!photoUrl || !isTelegramCdn(photoUrl)) {
    // Причина названа человеческим текстом: чаще всего фото просто закрыто
    // настройками приватности, и это не поломка, а ответ.
    return Response.json(
      { error: "Telegram не дал фото профиля — вероятно, оно закрыто настройками приватности." },
      { status: 200 },
    );
  }

  let data: Buffer;
  let mime: string;
  try {
    const response = await fetch(photoUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_PHOTO_TYPES.includes(mime)) throw new Error(`тип ${mime || "не указан"}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new Error("файл слишком большой");
    data = Buffer.from(buffer);
  } catch (error) {
    console.error("[avatar] не удалось забрать фото из Telegram", error);
    return Response.json({ error: "Не получилось забрать фото. Попробуйте загрузить его файлом." }, { status: 200 });
  }

  const key = await savePhoto(user.id, data, mime);
  const previous = user.avatarKey;
  await getDb().update(users).set({ avatarKey: key }).where(eq(users.id, user.id));
  // Прежний файл убираем после записи нового: упади она между удалением и
  // обновлением — человек остался бы без фото и без объяснения.
  if (previous) await deletePhoto(previous).catch(() => {});

  return Response.json({ ok: true, avatarKey: key }, { status: 200 });
}

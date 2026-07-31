/**
 * Картинка в приветствии бота.
 *
 * ## Почему это устроено сложнее, чем «отправь картинку»
 *
 * У `sendPhoto` два способа передать файл, и первый нам недоступен. По ссылке
 * картинку качает сам Telegram — а до jivoetelo.ru он не дотягивается: именно
 * из-за этого бот работает опросом, а не вебхуком (lib/bot/transport.ts).
 * Остаётся загрузка байтами, и она уходит наружу через тот же прокси, что и
 * остальные вызовы Bot API.
 *
 * Пройдёт ли multipart через прокси, заранее неизвестно — воркер писался под
 * JSON. Поэтому здесь не «отправить картинку», а «попробовать картинку, при
 * отказе отправить текст». Отказ проявится строкой в логе, а не молчащим
 * приветствием: худший исход — ровно то поведение, которое было до этой
 * правки.
 *
 * ## Один аплоад на процесс
 *
 * Первая удачная отправка возвращает `file_id`, и дальше Telegram шлёт эту же
 * картинку по идентификатору — без загрузки и почти мгновенно. Кэш живёт в
 * памяти процесса: цена его потери — один лишний аплоад после перезапуска,
 * ради этого не стоит заводить таблицу.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TelegramApiError, trySend, type SendMessageOptions, type TelegramClient } from "../telegram-api.ts";

/**
 * Собирается скриптом scripts/bot-image.mjs. В образе `public/` лежит рядом с
 * server.js (см. Dockerfile), в разработке — в корне проекта; в обоих случаях
 * это путь от рабочего каталога.
 */
const WELCOME_FILE = "public/bot/welcome.jpg";

/**
 * Сколько раз подряд можно провалиться, прежде чем перестать пробовать.
 * Разовый обрыв связи не должен выключать картинки до перезапуска, а
 * неподдерживаемый multipart не должен добавлять по одному медленному
 * запросу к каждому /start.
 */
const MAX_FAILURES = 3;

let cachedFileId: string | null = null;
let cachedBytes: Buffer | null = null;
let failures = 0;

/** Для тестов: вернуть модуль в исходное состояние. */
export function resetWelcomeCard(): void {
  cachedFileId = null;
  cachedBytes = null;
  failures = 0;
}

async function welcomeBytes(): Promise<Buffer | null> {
  if (cachedBytes) return cachedBytes;
  try {
    cachedBytes = await readFile(resolve(process.cwd(), WELCOME_FILE));
    return cachedBytes;
  } catch (error) {
    console.warn(`[bot] картинка ${WELCOME_FILE} не читается: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Отправляет приветствие картинкой с подписью. Возвращает `false`, если
 * картинку отправить не удалось, — тогда вызывающий шлёт обычный текст.
 *
 * Никогда не бросает: приветствие — не то, ради чего стоит терять апдейт.
 */
export async function sendWelcomeCard(
  client: TelegramClient,
  chatId: number | string,
  caption: string,
  options?: SendMessageOptions,
): Promise<boolean> {
  if (failures >= MAX_FAILURES) return false;

  // Человек заблокировал бота — картинка ни при чём, и записывать это в
  // отказы нельзя: три таких подряд выключили бы картинки для всех.
  const blocked = (error: unknown) => error instanceof TelegramApiError && error.isBlockedByUser;

  if (cachedFileId) {
    try {
      await client.sendPhoto(chatId, { fileId: cachedFileId }, caption, options);
      return true;
    } catch (error) {
      if (blocked(error)) return true;
      // Идентификатор мог протухнуть — пробуем залить заново, но один раз.
      cachedFileId = null;
    }
  }

  const bytes = await welcomeBytes();
  if (!bytes) {
    failures = MAX_FAILURES;
    return false;
  }

  try {
    const fileId = await client.sendPhoto(
      chatId,
      { bytes, filename: "welcome.jpg", mime: "image/jpeg" },
      caption,
      options,
    );
    if (fileId) cachedFileId = fileId;
    failures = 0;
    return true;
  } catch (error) {
    if (blocked(error)) return true;
    failures += 1;
    console.warn(
      `[bot] картинку отправить не удалось (${failures}/${MAX_FAILURES}): ` +
        `${error instanceof Error ? error.message : error}`,
    );
    if (failures >= MAX_FAILURES) {
      console.warn("[bot] дальше приветствие уходит текстом. Обычно причина — прокси не пропускает multipart.");
    }
    return false;
  }
}

/**
 * Приветствие: картинкой, если получится, иначе текстом. Одна точка вызова,
 * чтобы запасной путь нельзя было забыть.
 */
export async function sendWelcome(
  client: TelegramClient,
  chatId: number | string,
  text: string,
  options?: SendMessageOptions,
): Promise<void> {
  if (await sendWelcomeCard(client, chatId, text, options)) return;
  await trySend(client, chatId, text, options);
}

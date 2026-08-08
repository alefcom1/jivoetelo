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
import { reportBotProblem } from "./health.ts";

/**
 * Собирается скриптом scripts/bot-image.mjs. В образе `public/` лежит рядом с
 * server.js (см. Dockerfile), в разработке — в корне проекта; в обоих случаях
 * это путь от рабочего каталога.
 */
const WELCOME_FILE = "public/bot/welcome.jpg";

/**
 * Грустный Живело для седьмого дня тишины. Собирается тем же скриптом из
 * public/mascot/sad.webp.
 *
 * Картинка ровно одна на всю лестницу молчания (lib/reminders.ts) и намеренно:
 * повторённая на каждом шаге, она из редкого жеста превращается в приём, а
 * приём читается как манипуляция — тем более в сообщении, которое и так про
 * чувства.
 */
const MISSING_FILE = "public/bot/missing.jpg";

/**
 * Сколько раз подряд можно провалиться, прежде чем перестать пробовать.
 * Разовый обрыв связи не должен выключать картинки до перезапуска, а
 * неподдерживаемый multipart не должен добавлять по одному медленному
 * запросу к каждому /start.
 */
const MAX_FAILURES = 3;

/**
 * Состояние на каждую картинку своё. Общее было бы ошибкой: три неудачи
 * приветствия выключили бы заодно и картинку в напоминании, хотя причина у
 * них может быть разной, — а `file_id` у Telegram и вовсе свой на файл.
 */
type CardState = { fileId: string | null; bytes: Buffer | null; failures: number };

const cards = new Map<string, CardState>();

function stateFor(file: string): CardState {
  let state = cards.get(file);
  if (!state) {
    state = { fileId: null, bytes: null, failures: 0 };
    cards.set(file, state);
  }
  return state;
}

/** Для тестов: вернуть модуль в исходное состояние. */
export function resetWelcomeCard(): void {
  cards.clear();
}

async function cardBytes(file: string, state: CardState): Promise<Buffer | null> {
  if (state.bytes) return state.bytes;
  try {
    state.bytes = await readFile(resolve(process.cwd(), file));
    return state.bytes;
  } catch (error) {
    console.warn(`[bot] картинка ${file} не читается: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Отправляет картинку с подписью. Возвращает `false`, если не удалось, —
 * тогда вызывающий шлёт обычный текст.
 *
 * Никогда не бросает: ни приветствие, ни напоминание не стоят потерянного
 * апдейта.
 */
async function sendCard(
  file: string,
  client: TelegramClient,
  chatId: number | string,
  caption: string,
  options?: SendMessageOptions,
): Promise<boolean> {
  const state = stateFor(file);
  if (state.failures >= MAX_FAILURES) return false;

  // Человек заблокировал бота — картинка ни при чём, и записывать это в
  // отказы нельзя: три таких подряд выключили бы картинки для всех.
  //
  // Проверка смотрит на текст ответа Telegram, а не на один код 403, и это
  // важно именно здесь. Пока хватало кода, отказ прокси попадал в эту же
  // ветку: `sendWelcomeCard` возвращал «отправлено», запасной путь текстом не
  // запускался, и человек на /start не получал ничего — молча, без строки в
  // логе. Ровно это и искали два дня.
  const blocked = (error: unknown) => error instanceof TelegramApiError && error.isBlockedByUser;

  if (state.fileId) {
    try {
      await client.sendPhoto(chatId, { fileId: state.fileId }, caption, options);
      return true;
    } catch (error) {
      if (blocked(error)) return true;
      // Идентификатор мог протухнуть — пробуем залить заново, но один раз.
      state.fileId = null;
    }
  }

  const bytes = await cardBytes(file, state);
  if (!bytes) {
    state.failures = MAX_FAILURES;
    reportBotProblem(`картинка ${file} не читается — сообщение уходит текстом`);
    return false;
  }

  try {
    const fileId = await client.sendPhoto(
      chatId,
      { bytes, filename: file.split("/").at(-1) ?? "card.jpg", mime: "image/jpeg" },
      caption,
      options,
    );
    if (fileId) state.fileId = fileId;
    state.failures = 0;
    return true;
  } catch (error) {
    if (blocked(error)) return true;
    state.failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[bot] картинку ${file} отправить не удалось (${state.failures}/${MAX_FAILURES}): ${message}`);
    // И в диагностику тоже: до этой строки единственным следом была консоль
    // контейнера, а до неё в разборе так ни разу и не добрались.
    reportBotProblem(`картинка не отправилась (${state.failures}/${MAX_FAILURES}): ${message}`);
    if (state.failures >= MAX_FAILURES) {
      console.warn("[bot] дальше сообщение уходит текстом. Обычно причина — прокси не пропускает multipart.");
    }
    return false;
  }
}

export function sendWelcomeCard(
  client: TelegramClient,
  chatId: number | string,
  caption: string,
  options?: SendMessageOptions,
): Promise<boolean> {
  return sendCard(WELCOME_FILE, client, chatId, caption, options);
}

/**
 * Седьмой день тишины — грустный Живело с подписью.
 *
 * Как и приветствие: не получилось картинкой — уходит текстом. Напоминание
 * без картинки остаётся напоминанием, а вот молчание вместо него — нет.
 */
export async function sendMissingYou(
  client: TelegramClient,
  chatId: number | string,
  text: string,
  options?: SendMessageOptions,
): Promise<void> {
  if (await sendCard(MISSING_FILE, client, chatId, text, options)) return;
  await trySend(client, chatId, text, options);
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

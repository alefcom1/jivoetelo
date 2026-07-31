/**
 * Разбор апдейтов Telegram. Вся работа с базой, файлами и сетью вынесена в
 * `BotDeps`, поэтому сценарии бота проверяются обычными юнит-тестами:
 * «прислали фото без привязки», «прислали код», «нажали паузу» — без
 * Postgres и без Telegram.
 *
 * Бот сознательно устроен как инбокс, а не как чат: он принимает фото и коды
 * и отвечает короткими подтверждениями. Разбор еды, уточняющие вопросы и
 * редактирование остаются в приложении, где для этого есть экран.
 */

import { localMoment } from "../dates.ts";
import { snoozeUntil } from "../reminders.ts";
import { foodCategory } from "../food-category.ts";
import { inboxButton, openAppButton, type BotLinks } from "./links.ts";
import { sendWelcome } from "./media.ts";
import {
  ANSWERS,
  answerForQuestion,
  GREETING,
  looksLikeFood,
  photoSavedText,
  PHOTO,
  TEXT_LOOKS_LIKE_FOOD,
  UNSUPPORTED,
} from "./texts.ts";
import {
  pickPhotoSize,
  TelegramApiError,
  trySend,
  type InlineKeyboardButton,
  type SendMessageOptions,
  type TelegramClient,
  type TelegramUpdate,
} from "../telegram-api.ts";

/**
 * Все тексты бота размечены HTML (lib/bot/texts.ts), поэтому отправка идёт
 * через одну обёртку, а не через `trySend` напрямую: забытый `parseMode`
 * означал бы, что человек видит `<b>` глазами, и заметить это можно только
 * вручную открыв бот.
 */
function say(
  client: TelegramClient,
  chatId: number | string,
  text: string,
  extra?: Omit<SendMessageOptions, "parseMode">,
): Promise<boolean> {
  return trySend(client, chatId, text, { parseMode: "HTML", ...extra });
}

/** Больше этого за день фото в инбокс не принимаем — защита от заливки альбома. */
export const MAX_INBOX_PHOTOS_PER_DAY = 30;

/** Скачиваем не больше того же лимита, что и в веб-загрузке. */
export const MAX_BOT_PHOTO_BYTES = 8 * 1024 * 1024;

const LINK_CODE_RE = /^[0-9A-F]{8}$/;

/**
 * Альбом приходит не одним апдейтом, а несколькими сообщениями с общим
 * `media_group_id`. Сохранять надо каждое, а подтверждать — один раз: пять
 * снимков давали пять одинаковых сообщений подряд.
 *
 * Какое из них последнее, заранее неизвестно, поэтому отвечаем на первое, а
 * остальные молча сохраняем. Память процесса, а не база: цена ошибки —
 * лишнее подтверждение после перезапуска, заводить ради этого таблицу незачем. Размер ограничен, чтобы карта не росла без предела.
 */
const ALBUM_TTL_MS = 60_000;
const ALBUM_MAX = 200;
const seenAlbums = new Map<string, number>();

export function shouldConfirmAlbum(mediaGroupId: string | undefined, now: number): boolean {
  if (!mediaGroupId) return true;

  for (const [key, at] of seenAlbums) {
    if (now - at > ALBUM_TTL_MS) seenAlbums.delete(key);
  }
  if (seenAlbums.has(mediaGroupId)) return false;

  if (seenAlbums.size >= ALBUM_MAX) {
    const oldest = seenAlbums.keys().next().value;
    if (oldest !== undefined) seenAlbums.delete(oldest);
  }
  seenAlbums.set(mediaGroupId, now);
  return true;
}

export type BotStore = {
  findUserByTelegram(telegramUserId: string): Promise<{ id: number } | null>;
  linkByCode(code: string, telegramUserId: string): Promise<{ id: number } | null>;
  countInboxToday(userId: number, day: string): Promise<number>;
  savePhoto(userId: number, data: Buffer, mime: string): Promise<string>;
  addToInbox(input: {
    userId: number;
    photoKey: string;
    note: string | null;
    takenOn: string;
    takenTime: string;
  }): Promise<void>;
  setRemindersEnabled(userId: number, enabled: boolean): Promise<void>;
  snoozeReminders(userId: number, until: Date): Promise<void>;
};

export type BotDeps = {
  client: TelegramClient;
  store: BotStore;
  now: Date;
  timeZone?: string;
  links: BotLinks;
};

/**
 * Тексты бота живут в ./texts.ts. Здесь — плоский агрегат под старыми
 * именами: на TEXTS ссылаются напоминания и тесты, и разводить их по новым
 * путям ради переезда формулировок незачем.
 */
export const TEXTS = {
  greetingLinked: GREETING.linked,
  greetingUnlinked: GREETING.unlinked,
  linkFailed: GREETING.linkFailed,
  needLinkForPhoto: PHOTO.needLink,
  photoTooLarge: PHOTO.tooLarge,
  photoFailed: PHOTO.failed,
  dailyLimit: PHOTO.dailyLimit,
  remindersOff: ANSWERS.remindersOff,
  remindersOffNoAccount: ANSWERS.remindersOffNoAccount,
  snoozed: ANSWERS.snoozed,
  help: ANSWERS.help,
  openApp: ANSWERS.openApp,
  textLooksLikeFood: TEXT_LOOKS_LIKE_FOOD,
  voice: UNSUPPORTED.voice,
  video: UNSUPPORTED.video,
  sticker: UNSUPPORTED.sticker,
  fileNotImage: UNSUPPORTED.fileNotImage,
  otherAttachment: UNSUPPORTED.other,
} as const;

export { photoSavedText } from "./texts.ts";

function inboxKeyboard(links: BotLinks): { inline_keyboard: InlineKeyboardButton[][] } {
  return { inline_keyboard: [[inboxButton(links)]] };
}

/** Клавиатура вечернего дайджеста: разобрать или замолчать на несколько дней. */
export function digestKeyboard(links: BotLinks): { inline_keyboard: InlineKeyboardButton[][] } {
  return {
    inline_keyboard: [[inboxButton(links)], [{ text: "Пауза на 3 дня", callback_data: "snooze" }]],
  };
}

/**
 * Обрабатывает один апдейт. Никогда не бросает: Telegram повторяет доставку
 * при любой ошибке, а повтор нам не поможет — код привязки к тому моменту уже
 * будет использован, фото уже сохранено.
 */
export async function handleUpdate(update: TelegramUpdate, deps: BotDeps): Promise<void> {
  try {
    if (update.callback_query) return await handleCallback(update, deps);
    if (update.message) return await handleMessage(update, deps);
  } catch (error) {
    console.error("bot update failed", error);
  }
}

async function handleCallback(update: TelegramUpdate, deps: BotDeps): Promise<void> {
  const query = update.callback_query;
  const telegramUserId = query?.from?.id;
  if (!query?.id || !telegramUserId) return;

  const user = await deps.store.findUserByTelegram(String(telegramUserId));
  if (!user) {
    await deps.client.answerCallbackQuery(query.id, "Аккаунт не привязан").catch(() => {});
    return;
  }

  if (query.data === "snooze") {
    await deps.store.snoozeReminders(user.id, snoozeUntil(deps.now));
    await deps.client.answerCallbackQuery(query.id).catch(() => {});
    const chatId = query.message?.chat?.id ?? telegramUserId;
    await say(deps.client, chatId, TEXTS.snoozed);
    return;
  }

  await deps.client.answerCallbackQuery(query.id).catch(() => {});
}

async function handleMessage(update: TelegramUpdate, deps: BotDeps): Promise<void> {
  const message = update.message;
  const telegramUserId = message?.from?.id;
  const chatId = message?.chat?.id ?? telegramUserId;
  if (!message || !telegramUserId || !chatId) return;

  const tgId = String(telegramUserId);
  const text = (message.text ?? "").trim();

  // Фото — основной сценарий, поэтому проверяется первым.
  const photo = pickPhotoSize(message.photo, MAX_BOT_PHOTO_BYTES);
  if (message.photo?.length && !photo) {
    await say(deps.client, chatId, TEXTS.photoTooLarge);
    return;
  }
  if (photo) {
    await savePhotoToInbox(photo.file_id, message.caption ?? null, tgId, chatId, deps, message.media_group_id);
    return;
  }

  // Изображение, отправленное файлом: Telegram не сжимает его и не кладёт в
  // message.photo. Для нас это то же самое фото еды.
  const document = message.document;
  if (document?.file_id && document.mime_type?.startsWith("image/")) {
    if ((document.file_size ?? 0) > MAX_BOT_PHOTO_BYTES) {
      await say(deps.client, chatId, TEXTS.photoTooLarge);
      return;
    }
    await savePhotoToInbox(document.file_id, message.caption ?? null, tgId, chatId, deps, message.media_group_id);
    return;
  }

  // Вложения, которые бот не разбирает. Отвечаем до общей справки и по
  // отдельности: человек прислал не мусор, а попытку записать еду, и «голос
  // не расшифровываю» полезнее, чем «присылайте фото».
  if (message.voice || message.audio) {
    await say(deps.client, chatId, UNSUPPORTED.voice);
    return;
  }
  if (message.video || message.video_note) {
    await say(deps.client, chatId, UNSUPPORTED.video);
    return;
  }
  if (message.sticker || message.animation) {
    await say(deps.client, chatId, UNSUPPORTED.sticker);
    return;
  }
  if (message.location || message.contact || message.poll) {
    await say(deps.client, chatId, UNSUPPORTED.other);
    return;
  }
  // Документ дошёл сюда, только если он не картинка: изображения перехвачены выше.
  if (document?.file_id) {
    await say(deps.client, chatId, UNSUPPORTED.fileNotImage);
    return;
  }

  // /start может прийти с кодом привязки в диплинке: /start A1B2C3D4.
  if (text === "/start" || text.startsWith("/start ")) {
    const payload = text.slice("/start".length).trim().toUpperCase();
    if (LINK_CODE_RE.test(payload)) return await tryLink(payload, tgId, chatId, deps);

    const linked = await deps.store.findUserByTelegram(tgId);
    await greet(deps, chatId, linked ? GREETING.linked : GREETING.unlinked);
    return;
  }

  if (text === "/help") {
    await say(deps.client, chatId, ANSWERS.help);
    return;
  }

  if (text === "/app") {
    await say(deps.client, chatId, ANSWERS.openApp, { replyMarkup: inboxKeyboard(deps.links) });
    return;
  }

  if (text === "/stop") {
    const user = await deps.store.findUserByTelegram(tgId);
    // Без аккаунта выключать нечего — и говорить «выключено» было бы неправдой.
    if (!user) {
      await say(deps.client, chatId, ANSWERS.remindersOffNoAccount);
      return;
    }
    await deps.store.setRemindersEnabled(user.id, false);
    await say(deps.client, chatId, ANSWERS.remindersOff);
    return;
  }

  // Код привязки, присланный отдельным сообщением.
  const candidate = text.toUpperCase();
  if (LINK_CODE_RE.test(candidate)) return await tryLink(candidate, tgId, chatId, deps);

  // Вопрос словами — раньше всего этого не было и любой текст получал общую
  // справку. Порядок именно такой: сначала вопрос, потом еда. «Сколько
  // стоит подписка» содержит слово из справочника продуктов не чаще, чем
  // описание ужина содержит слово «тариф», но вопрос конкретнее.
  const answer = answerForQuestion(text);
  if (answer) {
    await say(deps.client, chatId, answer);
    return;
  }

  if (looksLikeFood(text, (word) => foodCategory(word) !== "other")) {
    await say(deps.client, chatId, TEXT_LOOKS_LIKE_FOOD, { replyMarkup: inboxKeyboard(deps.links) });
    return;
  }

  await say(deps.client, chatId, ANSWERS.help);
}

/**
 * Приветствие — единственное сообщение с картинкой. Она показывает экран
 * «Сегодня», то есть отвечает на вопрос «что я получу», который на первом
 * шаге и стоит. Остальные сообщения бот шлёт текстом: подтверждение к
 * только что присланному фото или отказ «не умею видео» картинкой не
 * улучшить, а лента из карточек читается хуже, чем короткая строка.
 *
 * Если картинка не уходит, sendWelcome сам присылает тот же текст, поэтому
 * отдельной ветки «а вдруг не получилось» здесь нет.
 */
function greet(deps: BotDeps, chatId: number, text: string): Promise<void> {
  return sendWelcome(deps.client, chatId, text, {
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: [[openAppButton(deps.links)]] },
  });
}

async function tryLink(code: string, tgId: string, chatId: number, deps: BotDeps): Promise<void> {
  const user = await deps.store.linkByCode(code, tgId);
  if (user) return await greet(deps, chatId, TEXTS.greetingLinked);
  await say(deps.client, chatId, TEXTS.linkFailed);
}

async function savePhotoToInbox(
  fileId: string,
  caption: string | null,
  tgId: string,
  chatId: number,
  deps: BotDeps,
  mediaGroupId?: string,
): Promise<void> {
  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await say(deps.client, chatId, TEXTS.needLinkForPhoto);
    return;
  }

  // Дата и время съёмки фиксируются здесь, а не в момент разбора: снимок,
  // присланный в 23:50, должен остаться во вчерашнем дне.
  const moment = localMoment(deps.now, deps.timeZone);
  const already = await deps.store.countInboxToday(user.id, moment.day);
  if (already >= MAX_INBOX_PHOTOS_PER_DAY) {
    await say(deps.client, chatId, TEXTS.dailyLimit);
    return;
  }

  let photoKey: string;
  try {
    const file = await deps.client.downloadFile(fileId, MAX_BOT_PHOTO_BYTES);
    photoKey = await deps.store.savePhoto(user.id, file.data, file.mime);
  } catch (error) {
    if (error instanceof TelegramApiError && /too large/.test(error.message)) {
      await say(deps.client, chatId, TEXTS.photoTooLarge);
      return;
    }
    console.error("bot photo download failed", error);
    await say(deps.client, chatId, TEXTS.photoFailed);
    return;
  }

  await deps.store.addToInbox({
    userId: user.id,
    photoKey,
    note: caption?.trim().slice(0, 300) || null,
    takenOn: moment.day,
    takenTime: moment.time,
  });

  // Снимок сохранён в любом случае; подтверждение — одно на альбом.
  if (!shouldConfirmAlbum(mediaGroupId, deps.now.getTime())) return;

  await say(deps.client, chatId, photoSavedText(already + 1), {
    replyMarkup: inboxKeyboard(deps.links),
    disablePreview: true,
  });
}

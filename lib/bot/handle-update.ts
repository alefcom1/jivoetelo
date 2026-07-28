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
import { inboxButton, type BotLinks } from "./links.ts";
import {
  pickPhotoSize,
  TelegramApiError,
  trySend,
  type InlineKeyboardButton,
  type TelegramClient,
  type TelegramUpdate,
} from "../telegram-api.ts";

/** Больше этого за день фото в инбокс не принимаем — защита от заливки альбома. */
export const MAX_INBOX_PHOTOS_PER_DAY = 30;

/** Скачиваем не больше того же лимита, что и в веб-загрузке. */
export const MAX_BOT_PHOTO_BYTES = 8 * 1024 * 1024;

const LINK_CODE_RE = /^[0-9A-F]{8}$/;

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

export const TEXTS = {
  greetingLinked:
    "Готово, аккаунт привязан.\n\nПрисылайте сюда фото еды в любой момент — хоть в кафе, хоть на бегу. Разбирать не обязательно сразу: вечером напомним, и вы соберёте день за пару минут.",
  greetingUnlinked:
    "Это бот «Живого Тела». Он принимает фото еды и хранит их, пока вам некогда.\n\nЧтобы связать его с вашим аккаунтом, откройте настройки на сайте, нажмите «Привязать Telegram» и пришлите сюда код из восьми символов.",
  linkFailed:
    "Код не подошёл — возможно, он устарел или уже использован. Коды живут пятнадцать минут: сгенерируйте новый в настройках на сайте.",
  needLinkForPhoto:
    "Фото пока некуда сохранить: аккаунт не привязан. Возьмите код в настройках на сайте и пришлите его сюда — это разовое действие.",
  photoTooLarge: "Это фото слишком большое. Обычный снимок с телефона проходит — попробуйте отправить его как фото, а не файлом.",
  photoFailed: "Не получилось сохранить фото. Попробуйте отправить ещё раз.",
  dailyLimit:
    "На сегодня в инбоксе уже достаточно снимков. Разберите то, что накопилось, — и присылайте дальше.",
  remindersOff: "Хорошо, напоминания выключены. Включить обратно можно в настройках на сайте.",
  snoozed: "Хорошо, на три дня замолчим. Инбокс никуда не денется.",
  help:
    "Присылайте фото еды — сохраним их до вечера.\n\nКоманды: /start — как всё устроено, /stop — выключить напоминания.",
} as const;

/** Подтверждение после сохранения снимка — с числом уже накопленного за день. */
export function photoSavedText(pendingToday: number): string {
  if (pendingToday <= 1) return "Сохранили. Вечером напомним разобрать — или откройте инбокс прямо сейчас.";
  return `Сохранили, теперь в инбоксе ${pendingToday}. Вечером напомним разобрать.`;
}

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
    await trySend(deps.client, chatId, TEXTS.snoozed);
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
    await trySend(deps.client, chatId, TEXTS.photoTooLarge);
    return;
  }
  if (photo) {
    await savePhotoToInbox(photo.file_id, message.caption ?? null, tgId, chatId, deps);
    return;
  }

  // Изображение, отправленное файлом: Telegram не сжимает его и не кладёт в
  // message.photo. Для нас это то же самое фото еды.
  const document = message.document;
  if (document?.file_id && document.mime_type?.startsWith("image/")) {
    if ((document.file_size ?? 0) > MAX_BOT_PHOTO_BYTES) {
      await trySend(deps.client, chatId, TEXTS.photoTooLarge);
      return;
    }
    await savePhotoToInbox(document.file_id, message.caption ?? null, tgId, chatId, deps);
    return;
  }

  // /start может прийти с кодом привязки в диплинке: /start A1B2C3D4.
  if (text === "/start" || text.startsWith("/start ")) {
    const payload = text.slice("/start".length).trim().toUpperCase();
    if (LINK_CODE_RE.test(payload)) return await tryLink(payload, tgId, chatId, deps);

    const linked = await deps.store.findUserByTelegram(tgId);
    await trySend(deps.client, chatId, linked ? TEXTS.greetingLinked : TEXTS.greetingUnlinked);
    return;
  }

  if (text === "/stop") {
    const user = await deps.store.findUserByTelegram(tgId);
    if (user) await deps.store.setRemindersEnabled(user.id, false);
    await trySend(deps.client, chatId, TEXTS.remindersOff);
    return;
  }

  // Код привязки, присланный отдельным сообщением.
  const candidate = text.toUpperCase();
  if (LINK_CODE_RE.test(candidate)) return await tryLink(candidate, tgId, chatId, deps);

  await trySend(deps.client, chatId, TEXTS.help);
}

async function tryLink(code: string, tgId: string, chatId: number, deps: BotDeps): Promise<void> {
  const user = await deps.store.linkByCode(code, tgId);
  await trySend(deps.client, chatId, user ? TEXTS.greetingLinked : TEXTS.linkFailed);
}

async function savePhotoToInbox(
  fileId: string,
  caption: string | null,
  tgId: string,
  chatId: number,
  deps: BotDeps,
): Promise<void> {
  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await trySend(deps.client, chatId, TEXTS.needLinkForPhoto);
    return;
  }

  // Дата и время съёмки фиксируются здесь, а не в момент разбора: снимок,
  // присланный в 23:50, должен остаться во вчерашнем дне.
  const moment = localMoment(deps.now, deps.timeZone);
  const already = await deps.store.countInboxToday(user.id, moment.day);
  if (already >= MAX_INBOX_PHOTOS_PER_DAY) {
    await trySend(deps.client, chatId, TEXTS.dailyLimit);
    return;
  }

  let photoKey: string;
  try {
    const file = await deps.client.downloadFile(fileId, MAX_BOT_PHOTO_BYTES);
    photoKey = await deps.store.savePhoto(user.id, file.data, file.mime);
  } catch (error) {
    if (error instanceof TelegramApiError && /too large/.test(error.message)) {
      await trySend(deps.client, chatId, TEXTS.photoTooLarge);
      return;
    }
    console.error("bot photo download failed", error);
    await trySend(deps.client, chatId, TEXTS.photoFailed);
    return;
  }

  await deps.store.addToInbox({
    userId: user.id,
    photoKey,
    note: caption?.trim().slice(0, 300) || null,
    takenOn: moment.day,
    takenTime: moment.time,
  });

  await trySend(deps.client, chatId, photoSavedText(already + 1), {
    replyMarkup: inboxKeyboard(deps.links),
    disablePreview: true,
  });
}

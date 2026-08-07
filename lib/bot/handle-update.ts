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
import { isStartPayload } from "../bot-public.ts";
import { referralFromStart } from "../referral.ts";
import { MAX_AUDIO_BYTES, MAX_DURATION_SEC } from "../speech/limits.ts";
import { SPEECH_ERRORS, SpeechError, type SpeechInput, type TranscriptResult } from "../speech/types.ts";
import { daySummaryText, weightSavedText, type DaySummaryInput } from "./day-summary.ts";
import { inlineResults } from "./inline.ts";
import { inboxButton, openAppButton, planButton, premiumButton, type BotLinks } from "./links.ts";
import { sendWelcome } from "./media.ts";
import { parseWeightMessage, MAX_WEIGHT_KG, MIN_WEIGHT_KG } from "./weight-message.ts";
import {
  ANSWERS,
  answerForQuestion,
  GREETING,
  inviteText,
  looksLikeFood,
  photoSavedText,
  PHOTO,
  PREMIUM,
  TEXT_LOOKS_LIKE_FOOD,
  UNSUPPORTED,
  VOICE,
  voiceSavedText,
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
    /** null — расшифрованное голосовое: файла нет, содержимое в `note`. */
    photoKey: string | null;
    note: string | null;
    takenOn: string;
    takenTime: string;
  }): Promise<void>;
  setRemindersEnabled(userId: number, enabled: boolean): Promise<void>;
  /**
   * Запомнить приглашение до регистрации.
   *
   * Необязательный: сценарии бота проверяются на поддельном хранилище, и
   * требовать этот метод от каждой заглушки в тестах значило бы, что
   * приглашения ломают проверки, к которым отношения не имеют.
   */
  rememberInvite?(telegramUserId: string, code: string): Promise<void>;
  snoozeReminders(userId: number, until: Date): Promise<void>;
  /**
   * Замер веса за день. Возвращает строку тренда («−0,4 кг за неделю») или
   * null, если замеров ещё мало: домысливать тренд по двум точкам нельзя, а
   * молчать про него — можно.
   */
  saveWeight(userId: number, day: string, weightKg: number): Promise<string | null>;
  /** Итог дня — уже посчитанный теми же модулями, что и в приложении. */
  daySummary(userId: number, day: string): Promise<DaySummaryInput>;
  /**
   * Личная ссылка приглашения и сколько людей по ней пришло.
   *
   * Ссылку и счётчик считает lib/referral-store.ts — тот же код, что и у
   * кнопки «Позвать друга» в Mini App. Две реализации одной ссылки означали
   * бы, что в чате и в приложении у человека разные коды.
   */
  referral(userId: number): Promise<{
    link: string;
    joined: number;
    /** Правило награды — числами оттуда же, где оно применяется. */
    reward: { afterDays: number; days: number };
  }>;
  /** Тариф пользователя — от него зависит ответ на /premium. */
  plan(userId: number): Promise<"free" | "premium">;
  /** Выключить утренние напоминания о весе — отдельно от вечерних. */
  setWeighRemindersEnabled(userId: number, enabled: boolean): Promise<void>;
};

export type BotDeps = {
  client: TelegramClient;
  store: BotStore;
  now: Date;
  timeZone?: string;
  links: BotLinks;
  /**
   * Включён ли приём оплаты (docs/payments.md). Отдельным полем, а не чтением
   * переменной окружения по месту: разбор апдейтов обязан оставаться
   * проверяемым, а «включено» и «выключено» — это два разных ответа на
   * /premium, и оба нужно уметь проверить тестом.
   */
  paymentsEnabled?: boolean;
  /**
   * Расшифровка голосовых. Как и всё остальное в BotDeps — зависимость, а не
   * прямой вызов: сценарии бота проверяются без сети и без модели.
   *
   * `null` означает «расшифровка выключена» (SPEECH_URL не задан или
   * SPEECH_PROVIDER=off). Тогда бот отвечает прежним честным отказом — и,
   * что важнее, не качает файл, который всё равно некому разобрать.
   */
  transcribe?: ((input: SpeechInput) => Promise<TranscriptResult>) | null;
};

/**
 * Тексты бота живут в ./texts.ts. Здесь — плоский агрегат под старыми
 * именами: на TEXTS ссылаются напоминания и тесты, и разводить их по новым
 * путям ради переезда формулировок незачем.
 */
export const TEXTS = {
  greetingLinked: GREETING.linked,
  greetingUnlinked: GREETING.unlinked,
  greetingFromSite: GREETING.fromSite,
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
    if (update.inline_query) return await handleInlineQuery(update, deps);
    if (update.callback_query) return await handleCallback(update, deps);
    if (update.message) return await handleMessage(update, deps);
  } catch (error) {
    console.error("bot update failed", error);
  }
}

/**
 * `@jivelo_bot борщ` из любого чата.
 *
 * Аккаунт не спрашиваем и в базу не ходим вовсе: справочник статический, а
 * запрос приходит от кого угодно, включая людей, которые бота не открывали.
 * Требовать здесь привязки значило бы выключить единственный канал, который
 * приводит новых людей сам.
 */
async function handleInlineQuery(update: TelegramUpdate, deps: BotDeps): Promise<void> {
  const query = update.inline_query;
  if (!query?.id) return;

  const results = inlineResults(query.query ?? "", {
    dishUrl: deps.links.dishUrl,
    planUrl: deps.links.planUrl,
  });
  // Пустой ответ — законный исход: Telegram просто ничего не покажет. Ошибку
  // отправки глотаем по той же причине, что и везде, — повтор не поможет.
  await deps.client.answerInlineQuery(query.id, results).catch((error) => {
    console.error("bot inline answer failed", error);
  });
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

  // Голосовое — второй способ записать еду, после фото. Аудиофайл считаем тем
  // же самым: разницы для расшифровки нет, а человек мог переслать себе же
  // надиктованное.
  const voice = message.voice ?? message.audio;
  if (voice) {
    await saveVoiceToInbox(voice, tgId, chatId, deps);
    return;
  }

  // Вложения, которые бот не разбирает. Отвечаем до общей справки и по
  // отдельности: человек прислал не мусор, а попытку записать еду, и «видео
  // не разбираю» полезнее, чем «присылайте фото».
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
    const raw = text.slice("/start".length).trim();
    const payload = raw.toUpperCase();
    if (LINK_CODE_RE.test(payload)) return await tryLink(payload, tgId, chatId, deps);

    /**
     * Приглашение по ссылке друга. Разбираем из исходной строки, а не из
     * приведённой к верхнему регистру: код приглашения строчный, и `payload`
     * его уже испортил — верхний регистр нужен только кодам привязки.
     *
     * Запоминаем, а не привязываем: аккаунта у человека ещё нет, он появится
     * при регистрации в Mini App (lib/referral-store.ts).
     */
    const invite = referralFromStart(raw);
    if (invite && deps.store.rememberInvite) {
      // Ошибка здесь не должна мешать поздороваться: приглашение — приятная
      // мелочь, а приветствие — то, ради чего человек нажал кнопку.
      await deps.store.rememberInvite(tgId, invite).catch(() => {});
    }

    const linked = await deps.store.findUserByTelegram(tgId);
    // Метка из ссылки на сайте: человек пришёл с экрана результата расчёта
    // или из пустого дневника. Предлагать ему посчитать норму заново — значит
    // не заметить, зачем он нажал кнопку.
    const fromSite = payload.length > 0 && isStartPayload(payload.toLowerCase());
    const greeting = linked ? GREETING.linked : fromSite ? GREETING.fromSite : GREETING.unlinked;
    await greet(deps, chatId, greeting, Boolean(linked));
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

  if (text === "/day") return await sendDaySummary(tgId, chatId, deps);
  if (text === "/invite") return await sendInvite(tgId, chatId, deps);
  if (text === "/premium") return await sendPremium(tgId, chatId, deps);

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

  // Отдельная команда, потому что переключатель отдельный: /stop выключает
  // разговор про еду и утренних весов не касается.
  if (text === "/stopweight") {
    const user = await deps.store.findUserByTelegram(tgId);
    if (!user) {
      await say(deps.client, chatId, ANSWERS.remindersOffNoAccount);
      return;
    }
    await deps.store.setWeighRemindersEnabled(user.id, false);
    await say(deps.client, chatId, ANSWERS.weighRemindersOff);
    return;
  }

  // Код привязки, присланный отдельным сообщением. Стоит выше веса: коды у
  // нас восьмизначные и шестнадцатеричные, то есть «12345678» — законный код,
  // и трактовать его как вес было бы потерей привязки.
  const candidate = text.toUpperCase();
  if (LINK_CODE_RE.test(candidate)) return await tryLink(candidate, tgId, chatId, deps);

  // Вес одним сообщением — самый дешёвый способ дать данные адаптивной норме.
  const weight = parseWeightMessage(text);
  if (weight) return await saveWeight(weight, tgId, chatId, deps);

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
function greet(deps: BotDeps, chatId: number, text: string, linked: boolean): Promise<void> {
  // Кнопка зависит от того, есть ли аккаунт. Незнакомому человеку «Открыть
  // дневник» бесполезна: она ведёт туда, где потребуют войти. Ему нужен
  // расчёт, который работает без всякого аккаунта.
  const button = linked ? openAppButton(deps.links) : planButton(deps.links);
  return sendWelcome(deps.client, chatId, text, {
    parseMode: "HTML",
    replyMarkup: { inline_keyboard: [[button]] },
  });
}

/**
 * Итог дня: сколько съедено из коридора, белок, клетчатка.
 *
 * Числа берутся тем же кодом, что и в приложении, — «упрощённой сводки для
 * бота» быть не должно: две цифры за один день, разошедшиеся между ботом и
 * Mini App, обесценивают обе.
 */
async function sendDaySummary(tgId: string, chatId: number, deps: BotDeps): Promise<void> {
  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await say(deps.client, chatId, ANSWERS.dayNoAccount, {
      replyMarkup: { inline_keyboard: [[planButton(deps.links)]] },
    });
    return;
  }

  const moment = localMoment(deps.now, deps.timeZone);
  const summary = await deps.store.daySummary(user.id, moment.day);
  await say(deps.client, chatId, daySummaryText(summary), {
    replyMarkup: inboxKeyboard(deps.links),
    disablePreview: true,
  });
}

/**
 * Вес одним сообщением.
 *
 * Подтверждение обязательно называет записанное число: «72,4» без ответа —
 * это запись вслепую, а «записал 72,4 кг» человек проверит глазом сразу и
 * поправит следующим сообщением, если ошибся клавиатурой. Замер за день
 * перезаписывается — как и в приложении.
 */
async function saveWeight(
  weight: NonNullable<ReturnType<typeof parseWeightMessage>>,
  tgId: string,
  chatId: number,
  deps: BotDeps,
): Promise<void> {
  if (weight.kind === "out_of_range") {
    await say(
      deps.client,
      chatId,
      `⚖️ <b>Это не похоже на вес.</b>\n\nЗаписываю значения от ${MIN_WEIGHT_KG} до ${MAX_WEIGHT_KG} кг.`,
    );
    return;
  }

  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await say(deps.client, chatId, ANSWERS.weightNoAccount);
    return;
  }

  const moment = localMoment(deps.now, deps.timeZone);
  let trendLine: string | null;
  try {
    trendLine = await deps.store.saveWeight(user.id, moment.day, weight.weightKg);
  } catch (error) {
    console.error("bot weight save failed", error);
    await say(deps.client, chatId, ANSWERS.weightSaveFailed);
    return;
  }

  await say(deps.client, chatId, weightSavedText(weight.weightKg, trendLine), {
    replyMarkup: { inline_keyboard: [[openAppButton(deps.links)]] },
    disablePreview: true,
  });
}

/** Личная ссылка приглашения. Без аккаунта её неоткуда взять. */
async function sendInvite(tgId: string, chatId: number, deps: BotDeps): Promise<void> {
  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await say(deps.client, chatId, ANSWERS.dayNoAccount, {
      replyMarkup: { inline_keyboard: [[planButton(deps.links)]] },
    });
    return;
  }

  const { link, joined, reward } = await deps.store.referral(user.id);
  await say(deps.client, chatId, inviteText(link, joined, reward), { disablePreview: true });
}

/**
 * Платный доступ.
 *
 * Пока приём оплаты выключен, кнопки нет вовсе. Кнопка со словами «скоро» —
 * худший вариант: человек нажимает и упирается в пустоту, а мы получаем
 * репутацию сервиса, который берёт деньги за то, чего нет.
 */
async function sendPremium(tgId: string, chatId: number, deps: BotDeps): Promise<void> {
  if (!deps.paymentsEnabled) {
    await say(deps.client, chatId, PREMIUM.notYet);
    return;
  }

  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await say(deps.client, chatId, ANSWERS.dayNoAccount, {
      replyMarkup: { inline_keyboard: [[planButton(deps.links)]] },
    });
    return;
  }

  if ((await deps.store.plan(user.id)) === "premium") {
    await say(deps.client, chatId, PREMIUM.alreadyPremium);
    return;
  }

  await say(deps.client, chatId, PREMIUM.available, {
    replyMarkup: { inline_keyboard: [[premiumButton(deps.links)]] },
    disablePreview: true,
  });
}

async function tryLink(code: string, tgId: string, chatId: number, deps: BotDeps): Promise<void> {
  const user = await deps.store.linkByCode(code, tgId);
  if (user) return await greet(deps, chatId, TEXTS.greetingLinked, true);
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

/**
 * Голосовое: расшифровать и положить в инбокс текстом.
 *
 * Почему в инбокс, а не сразу в дневник. Тот же довод, что и у фото: разбор
 * задаёт уточняющие вопросы и открывает черновик с порциями, для этого нужен
 * экран. Плюс распознавание ошибается, и запись, попавшая в дневник без
 * подтверждения, обнаружилась бы неделю спустя чужими калориями.
 *
 * Расшифровка ложится в `note` — то же поле, где у фото лежит подпись. Для
 * разбора это одно и то же: «что человек сказал про эту еду словами».
 */
async function saveVoiceToInbox(
  voice: { file_id?: string; mime_type?: string; file_size?: number; duration?: number },
  tgId: string,
  chatId: number,
  deps: BotDeps,
): Promise<void> {
  // Ничего не качаем, если расшифровывать некому: файл всё равно некуда деть.
  if (!deps.transcribe) {
    await say(deps.client, chatId, UNSUPPORTED.voice);
    return;
  }
  if (!voice.file_id) {
    await say(deps.client, chatId, VOICE.failed);
    return;
  }

  // Длительность Telegram сообщает в самом апдейте — длинную запись видно до
  // загрузки файла, и платить за неё трафиком незачем.
  if ((voice.duration ?? 0) > MAX_DURATION_SEC) {
    await say(deps.client, chatId, SPEECH_ERRORS.too_long);
    return;
  }

  const user = await deps.store.findUserByTelegram(tgId);
  if (!user) {
    await say(deps.client, chatId, VOICE.needLink);
    return;
  }

  const moment = localMoment(deps.now, deps.timeZone);
  // Тот же дневной потолок, что у снимков: инбокс общий, и защищать его от
  // заливки надо целиком, а не по каждому виду записей отдельно.
  const already = await deps.store.countInboxToday(user.id, moment.day);
  if (already >= MAX_INBOX_PHOTOS_PER_DAY) {
    await say(deps.client, chatId, TEXTS.dailyLimit);
    return;
  }

  let transcript: string;
  try {
    const file = await deps.client.downloadFile(voice.file_id, MAX_AUDIO_BYTES);
    const result = await deps.transcribe({
      data: file.data,
      // Telegram отдаёт голосовые как audio/ogg, но у пересланного аудиофайла
      // тип может быть любым. Что из этого мы принимаем, решает checkAudio.
      mime: voice.mime_type || file.mime,
      durationSec: voice.duration,
    });
    transcript = result.text.trim();
  } catch (error) {
    if (error instanceof SpeechError) {
      await say(deps.client, chatId, SPEECH_ERRORS[error.reason]);
      return;
    }
    if (error instanceof TelegramApiError && /too large/.test(error.message)) {
      await say(deps.client, chatId, SPEECH_ERRORS.too_large);
      return;
    }
    console.error("bot voice failed", error);
    await say(deps.client, chatId, VOICE.failed);
    return;
  }

  // Пустая расшифровка без ошибки — провайдер счёл запись речью, но слов не
  // нашёл. Класть в инбокс пустую строку нельзя: разбирать её нечем.
  if (!transcript) {
    await say(deps.client, chatId, SPEECH_ERRORS.empty);
    return;
  }

  await deps.store.addToInbox({
    userId: user.id,
    photoKey: null,
    note: transcript.slice(0, 300),
    takenOn: moment.day,
    takenTime: moment.time,
  });

  await say(deps.client, chatId, voiceSavedText(transcript.slice(0, 300)), {
    replyMarkup: inboxKeyboard(deps.links),
    disablePreview: true,
  });
}

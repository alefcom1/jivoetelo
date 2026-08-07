/**
 * Тонкий клиент Telegram Bot API. Библиотеку сюда сознательно не берём: боту
 * нужно пять методов, а любой фреймворк тянет за собой роутер апдейтов,
 * сессии и middleware, которые нам не нужны и которые придётся мокать в
 * тестах. Здесь вместо этого одна точка входа `call`, и тесты подменяют
 * `fetch` обычной функцией.
 *
 * Все методы возвращают результат или бросают TelegramApiError. Отправку
 * сообщений при этом почти везде оборачиваем в `trySend`: упавшее напоминание
 * не должно ронять цикл планировщика для остальных пользователей.
 */

import { reportBotProblem } from "./bot/health.ts";

/**
 * Адрес Bot API. Обычно это api.telegram.org, но с российского VPS он может
 * быть недоступен — ровно та же история, что с api.anthropic.com
 * (docs/ai-proxy.md). Тогда сюда подставляется прокси, а код не меняется.
 *
 * Входящие апдейты от этого не зависят: их Telegram присылает нам сам,
 * вебхуком. Через прокси идут только исходящие вызовы — ответы бота,
 * getFile и скачивание фото.
 */
function apiRoot(): string {
  return (process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org").replace(/\/+$/, "");
}

/**
 * Заголовок авторизации перед прокси. Самому Bot API он не нужен — токен там
 * лежит в пути, — но прокси-воркер пускает только по общему секрету и этот
 * заголовок до Telegram не доводит, отбрасывая его при пересылке.
 */
function proxyHeaders(): Record<string, string> {
  const token = process.env.TELEGRAM_API_AUTH?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly errorCode: number | null;

  constructor(method: string, message: string, errorCode: number | null) {
    super(`${method}: ${message}`);
    this.method = method;
    this.errorCode = errorCode;
  }

  /**
   * 403 приходит, когда пользователь заблокировал бота или удалил чат.
   * Это не сбой — это ответ, который нужно запомнить, а не повторять.
   */
  get isBlockedByUser(): boolean {
    return this.errorCode === 403;
  }
}

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }
  | { text: string; web_app: { url: string } };

export type SendMessageOptions = {
  replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] };
  /** Telegram по умолчанию разворачивает ссылки — в напоминаниях это лишний шум. */
  disablePreview?: boolean;
  /**
   * Разметка сообщения. Включается по месту, а не глобально: под разметкой
   * любой подставленный текст нужно экранировать (`escapeHtml` из
   * lib/bot/markup.ts), и лучше, чтобы это решение принималось осознанно для
   * каждого сообщения. HTML, а не MarkdownV2 — последний требует
   * экранировать полтора десятка знаков, включая точку, дефис и скобки,
   * которых в русских текстах полно.
   */
  parseMode?: "HTML";
};

/**
 * Откуда брать картинку для `sendPhoto`.
 *
 * Ссылкой отправить нельзя, хотя Bot API это умеет: по ссылке картинку качает
 * сам Telegram, а до jivoetelo.ru он не дотягивается — ровно та причина, по
 * которой бот работает опросом, а не вебхуком (lib/bot/transport.ts).
 * Остаётся загрузка байтами, она идёт наружу через наш прокси.
 *
 * `fileId` — то, что Telegram вернул после первой загрузки. Повторная
 * отправка по нему бесплатна и мгновенна, поэтому файл заливается один раз
 * за жизнь процесса (lib/bot/media.ts).
 */
export type PhotoSource = { fileId: string } | { bytes: Buffer; filename: string; mime: string };

/** Размер фото в ответе Telegram — нужен, чтобы запомнить file_id. */
type SentPhoto = { photo?: TelegramFile[] };

export type TelegramFile = { file_id: string; file_unique_id: string; file_size?: number };

/** Минимальная форма апдейта: разбираем только то, что бот действительно умеет. */
export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; first_name?: string };
    chat?: { id?: number; type?: string };
    text?: string;
    caption?: string;
    photo?: TelegramFile[];
    document?: { file_id?: string; mime_type?: string; file_size?: number };
    /** Общий идентификатор у снимков одного альбома — см. handle-update.ts. */
    media_group_id?: string;
    /**
     * Голосовое сообщение: качаем, расшифровываем и кладём в инбокс текстом.
     * `duration` Telegram сообщает всегда — по нему длинную запись видно до
     * загрузки файла.
     */
    voice?: { file_id?: string; mime_type?: string; file_size?: number; duration?: number };
    /** Аудиофайл. Для нас это то же самое, что голосовое. */
    audio?: { file_id?: string; mime_type?: string; file_size?: number; duration?: number };
    // Вложения, которые бот не разбирает. Нужны не для обработки, а для
    // осмысленного ответа: «не умею видео» полезнее, чем общая справка.
    video?: unknown;
    video_note?: unknown;
    sticker?: unknown;
    animation?: unknown;
    location?: unknown;
    contact?: unknown;
    poll?: unknown;
  };
  callback_query?: {
    id?: string;
    from?: { id?: number; first_name?: string };
    message?: { chat?: { id?: number } };
    data?: string;
  };
  /**
   * `@jivelo_bot борщ`, набранное в любом чате. Приходит от кого угодно, в
   * том числе от людей, которые бота ни разу не открывали, — это и есть его
   * ценность, поэтому привязки аккаунта здесь не требуется (lib/bot/inline.ts).
   */
  inline_query?: {
    id?: string;
    from?: { id?: number };
    query?: string;
  };
};

/**
 * Ответ на инлайн-запрос. Форма результата описана Telegram и передаётся как
 * есть — свой тип для неё живёт в lib/bot/inline.ts, рядом со сборкой.
 */
export type InlineAnswerOptions = {
  /** Сколько Telegram может держать ответ в кэше, секунды. */
  cacheTime?: number;
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/** Настроен ли бот. Без токена все точки входа отвечают 503, а не падают. */
export function isBotConfigured(): boolean {
  return botToken() !== null;
}

export type TelegramClient = {
  call<T>(method: string, payload: Record<string, unknown>): Promise<T>;
  sendMessage(chatId: number | string, text: string, options?: SendMessageOptions): Promise<void>;
  /** Возвращает file_id отправленной картинки — его стоит запомнить. */
  sendPhoto(
    chatId: number | string,
    photo: PhotoSource,
    caption: string,
    options?: SendMessageOptions,
  ): Promise<string | null>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  answerInlineQuery(inlineQueryId: string, results: unknown[], options?: InlineAnswerOptions): Promise<void>;
  downloadFile(fileId: string, maxBytes: number): Promise<{ data: Buffer; mime: string }>;
};

/**
 * Создаёт клиент. Токен и fetch передаются аргументами, чтобы тесты не
 * зависели ни от окружения, ни от сети.
 */
export function createTelegramClient(token: string, fetchImpl: FetchLike = fetch): TelegramClient {
  /** Один запрос к Bot API. Тело собирает вызывающий: JSON или multipart. */
  async function request<T>(method: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${apiRoot()}/bot${token}/${method}`, { method: "POST", ...init });
    } catch (error) {
      throw new TelegramApiError(method, error instanceof Error ? error.message : "network error", null);
    }

    let body: { ok?: boolean; result?: T; description?: string; error_code?: number };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new TelegramApiError(method, `unparsable response (HTTP ${response.status})`, response.status);
    }

    if (!body.ok) {
      throw new TelegramApiError(method, body.description ?? `HTTP ${response.status}`, body.error_code ?? response.status);
    }
    return body.result as T;
  }

  async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    return request<T>(method, {
      headers: { "content-type": "application/json", ...proxyHeaders() },
      body: JSON.stringify(payload),
    });
  }

  return {
    call,

    async sendMessage(chatId, text, options = {}) {
      await call("sendMessage", {
        chat_id: chatId,
        text,
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        ...(options.disablePreview ? { link_preview_options: { is_disabled: true } } : {}),
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      });
    },

    async sendPhoto(chatId, photo, caption, options = {}) {
      const common = {
        chat_id: String(chatId),
        caption,
        ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      };

      let sent: SentPhoto;
      if ("fileId" in photo) {
        sent = await call<SentPhoto>("sendPhoto", {
          ...common,
          photo: photo.fileId,
          ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        });
      } else {
        // Загрузка файлом — multipart. Content-Type здесь не ставим: fetch
        // выведет его из FormData вместе с границей, а заданный вручную
        // заголовок эту границу потеряет и запрос развалится.
        const form = new FormData();
        for (const [key, value] of Object.entries(common)) form.append(key, String(value));
        if (options.replyMarkup) form.append("reply_markup", JSON.stringify(options.replyMarkup));
        form.append("photo", new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }), photo.filename);
        sent = await request<SentPhoto>("sendPhoto", { headers: proxyHeaders(), body: form });
      }

      // Telegram отдаёт лестницу превью; file_id есть у каждого и годится
      // для повторной отправки любой из них. Берём последний — самый крупный.
      return sent?.photo?.at(-1)?.file_id ?? null;
    },

    async answerCallbackQuery(callbackQueryId, text) {
      await call("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      });
    },

    async answerInlineQuery(inlineQueryId, results, options = {}) {
      await call("answerInlineQuery", {
        inline_query_id: inlineQueryId,
        results,
        // Ответ одинаков для всех: справочник не зависит от того, кто
        // спрашивает. `is_personal` не ставим — иначе Telegram кэширует
        // отдельно на каждого и лишает нас единственной дешёвой оптимизации.
        cache_time: options.cacheTime ?? 300,
      });
    },

    async downloadFile(fileId, maxBytes) {
      const file = await call<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
      if (!file.file_path) throw new TelegramApiError("getFile", "file_path missing", null);
      // Telegram отдаёт размер ещё до скачивания — проверяем здесь, чтобы не
      // тянуть по сети то, что всё равно отвергнем.
      if (file.file_size && file.file_size > maxBytes) {
        throw new TelegramApiError("getFile", `file too large: ${file.file_size}`, null);
      }

      const response = await fetchImpl(`${apiRoot()}/file/bot${token}/${file.file_path}`, {
        headers: proxyHeaders(),
      });
      if (!response.ok) {
        throw new TelegramApiError("downloadFile", `HTTP ${response.status}`, response.status);
      }
      const data = Buffer.from(await response.arrayBuffer());
      if (data.byteLength > maxBytes) {
        throw new TelegramApiError("downloadFile", `file too large: ${data.byteLength}`, null);
      }
      return { data, mime: mimeFromPath(file.file_path) };
    },
  };
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Telegram не сообщает MIME скачиваемого файла — только путь. Расширение в
 * пути ставит сам Telegram после перекодирования, поэтому ему можно верить
 * больше, чем имени файла от пользователя.
 */
export function mimeFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Выбирает подходящий размер фото. Telegram присылает лестницу превью; самый
 * большой обычно избыточен для разбора и стоит трафика, самый маленький
 * нечитаем. Берём наибольший из тех, что укладываются в лимит.
 */
export function pickPhotoSize(sizes: TelegramFile[] | undefined, maxBytes: number): TelegramFile | null {
  if (!Array.isArray(sizes) || sizes.length === 0) return null;
  const fitting = sizes.filter((s) => !s.file_size || s.file_size <= maxBytes);
  if (fitting.length === 0) return null;
  return fitting.reduce((best, current) => ((current.file_size ?? 0) > (best.file_size ?? 0) ? current : best));
}

/** Отправка, которая не бросает: возвращает true при успехе. */
export async function trySend(
  client: TelegramClient,
  chatId: number | string,
  text: string,
  options?: SendMessageOptions,
): Promise<boolean> {
  try {
    await client.sendMessage(chatId, text, options);
    return true;
  } catch (error) {
    // Заблокировавший бота — не поломка, а ответ: записывать его как неполадку
    // значит завалить диагностику шумом от тех, кто просто ушёл.
    if (error instanceof TelegramApiError && error.isBlockedByUser) return false;
    const message = error instanceof Error ? error.message : String(error);
    console.error("telegram sendMessage failed", error);
    // Раньше здесь всё и заканчивалось. Именно этот отказ — «сообщение дошло,
    // ответ не ушёл» — оказался невидимым, когда опрос наконец заработал.
    reportBotProblem(`ответ не отправлен: ${message}`);
    return false;
  }
}

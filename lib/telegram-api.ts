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
};

export type TelegramFile = { file_id: string; file_unique_id: string; file_size?: number };

/** Минимальная форма апдейта: разбираем только то, что бот действительно умеет. */
export type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; first_name?: string };
    chat?: { id?: number };
    text?: string;
    caption?: string;
    photo?: TelegramFile[];
    document?: { file_id?: string; mime_type?: string; file_size?: number };
  };
  callback_query?: {
    id?: string;
    from?: { id?: number; first_name?: string };
    message?: { chat?: { id?: number } };
    data?: string;
  };
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
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  downloadFile(fileId: string, maxBytes: number): Promise<{ data: Buffer; mime: string }>;
};

/**
 * Создаёт клиент. Токен и fetch передаются аргументами, чтобы тесты не
 * зависели ни от окружения, ни от сети.
 */
export function createTelegramClient(token: string, fetchImpl: FetchLike = fetch): TelegramClient {
  async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${apiRoot()}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
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

  return {
    call,

    async sendMessage(chatId, text, options = {}) {
      await call("sendMessage", {
        chat_id: chatId,
        text,
        ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
        ...(options.disablePreview ? { link_preview_options: { is_disabled: true } } : {}),
      });
    },

    async answerCallbackQuery(callbackQueryId, text) {
      await call("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
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

      const response = await fetchImpl(`${apiRoot()}/file/bot${token}/${file.file_path}`);
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
    if (error instanceof TelegramApiError && error.isBlockedByUser) return false;
    console.error("telegram sendMessage failed", error);
    return false;
  }
}

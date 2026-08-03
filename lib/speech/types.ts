/**
 * Расшифровка речи: типы и тексты ошибок.
 *
 * Устроено так же, как разбор еды (lib/ai/types.ts) и почта (lib/mailer.ts):
 * интерфейс с несколькими реализациями, выбор — по переменным окружения.
 * Причина та же самая: без ключей всё должно честно говорить «не настроено»,
 * а не падать и не выдумывать.
 */

/** Что пришло на расшифровку. */
export type SpeechInput = {
  data: Buffer;
  /**
   * MIME присланного файла. Telegram отдаёт голосовые как `audio/ogg`
   * (Opus внутри), Mini App через MediaRecorder — обычно `audio/webm`.
   */
  mime: string;
  /** Длительность в секундах, если её сообщил источник. */
  durationSec?: number;
};

export type TranscriptResult = {
  /** Расшифрованный текст. Пустая строка — речи не распознано. */
  text: string;
  /**
   * Уверенность распознавания 0…1, если провайдер её сообщает. Наружу
   * показывать не обязательно, но по ней видно, когда стоит переспросить.
   */
  confidence?: number;
};

export interface SpeechProvider {
  transcribe(input: SpeechInput): Promise<TranscriptResult>;
}

/**
 * Причины отказа.
 *
 * `disabled` отдельно от `provider_error` по той же причине, что и в разборе
 * еды: выключенная возможность — не сбой, и «попробуйте через минуту» тут
 * вводит в заблуждение.
 *
 * `empty` — расшифровка прошла, но речи в записи не нашлось: тишина,
 * случайное нажатие, шум. Это не ошибка сервиса, и говорить о ней надо
 * иначе, чем о сбое.
 */
export type SpeechFailure = "disabled" | "too_long" | "too_large" | "unsupported_format" | "empty" | "provider_error";

export class SpeechError extends Error {
  readonly reason: SpeechFailure;

  constructor(message: string, reason: SpeechFailure) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Тексты для человека — одной таблицей, а не по копии у бота и у Mini App.
 * У разбора еды такие копии однажды разошлись, и вторая молча отдавала
 * `undefined` на новую причину сбоя.
 */
export const SPEECH_ERRORS: Record<SpeechFailure, string> = {
  disabled: "Голосовые я пока не расшифровываю. Опишите еду текстом или пришлите фото — это работает.",
  too_long: "Запись длинновата. Скажите короче — что и сколько съели, одной фразой.",
  too_large: "Файл слишком большой. Короткая запись на несколько секунд подойдёт лучше.",
  unsupported_format: "Такой формат записи я не разберу. Проще прислать голосовое прямо из Telegram.",
  empty: "Речи в записи не слышно. Попробуйте ещё раз — ближе к микрофону и без спешки.",
  provider_error: "Расшифровка сейчас недоступна. Попробуйте через минуту или опишите еду текстом.",
};

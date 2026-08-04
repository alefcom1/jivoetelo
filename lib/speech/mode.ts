/**
 * Режим расшифровки речи. Правила ровно те же, что у AI-разбора
 * (lib/ai/mode.ts), и по той же причине — сознательно.
 *
 * Значения `SPEECH_PROVIDER`:
 * - пусто — `gigaam`, если задан адрес сервиса; иначе `mock` в разработке и
 *   `off` в продакшене;
 * - `off` — голосовые не расшифровываются, бот и Mini App честно об этом
 *   говорят;
 * - `mock` — детерминированный текст без внешних вызовов, для разработки;
 * - `demo` — то же самое, но осознанно и в бою.
 *
 * Про `mock` в продакшене здесь строже, чем у разбора еды, и вот почему. Там
 * mock возвращает выдуманные калории — плохо, но человек хотя бы видит, что
 * разбор не про его тарелку. Здесь mock вернул бы текст, которого человек не
 * говорил, и записал бы его в дневник как сказанное вслух. Поэтому в
 * продакшене `mock` превращается в `off`.
 */

export type SpeechMode = "gigaam" | "mock" | "off";

/**
 * Адрес сервиса распознавания. Своя установка GigaAM-v3 (открытая модель
 * Сбера, MIT) на том же VPS — выбор из docs/market-research.md: по-русски она
 * заметно точнее whisper-large-v3, а главное, запись не уходит наружу, и
 * трансграничной передачи здесь не возникает вовсе.
 */
export function speechUrl(): string {
  return process.env.SPEECH_URL?.trim() ?? "";
}

/** Токен сервиса, если он его требует. Пусто — запрос уходит без заголовка. */
export function speechToken(): string {
  return process.env.SPEECH_TOKEN?.trim() ?? "";
}

export function hasSpeechCredentials(): boolean {
  return speechUrl().length > 0;
}

/**
 * Умеем ли мы вообще расшифровывать сейчас. Нужно до получения файла: бот
 * должен ответить «не расшифровываю» сразу, а не после того, как выкачает
 * голосовое из Telegram.
 */
export function isSpeechEnabled(): boolean {
  return resolveSpeechMode() !== "off";
}

export function resolveSpeechMode(): SpeechMode {
  const forced = process.env.SPEECH_PROVIDER?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (forced === "off") return "off";
  if (forced === "demo") return "mock";

  if (forced === "mock") {
    if (!isProduction) return "mock";
    console.warn("SPEECH_PROVIDER=mock в продакшене выключает расшифровку, а не подделывает её. Нужна живая демонстрация — SPEECH_PROVIDER=demo.");
    return "off";
  }

  if (!hasSpeechCredentials()) {
    if (isProduction) {
      console.warn("SPEECH_URL не задан — расшифровка голосовых выключена (режим off).");
      return "off";
    }
    return "mock";
  }

  return "gigaam";
}

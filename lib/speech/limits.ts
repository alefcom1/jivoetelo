/**
 * Пределы на входящую запись. Отдельно от провайдеров, потому что проверять
 * их надо до расшифровки: и до сети, и до квоты. Чистый модуль — проверяется
 * тестами без ключей и без сети.
 */

import { SpeechError, type SpeechInput } from "./types.ts";

/**
 * Предел длительности. Тридцать секунд — это не техническое ограничение
 * модели, а граница смысла: «овсянка на воде, граммов двести, и банан» —
 * пять секунд. Запись на минуту почти наверняка не про еду, а расшифровка
 * стоит времени человека, который ждёт ответа.
 */
export const MAX_DURATION_SEC = 30;

/**
 * Предел размера. Голосовое в Telegram — Opus около 8 кбит/с, полминуты
 * весит ~30 КБ. Мегабайт даёт запас на любой разумный кодек и всё ещё
 * отсекает присланный по ошибке подкаст.
 */
export const MAX_AUDIO_BYTES = 1024 * 1024;

/**
 * Что принимаем. Список по основному типу, без параметров: Telegram шлёт
 * `audio/ogg`, MediaRecorder в браузере — `audio/webm;codecs=opus`, Safari —
 * `audio/mp4`.
 */
const ALLOWED = ["audio/ogg", "audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/aac", "audio/flac"];

/** Тип без параметров и регистра: `audio/webm;codecs=opus` → `audio/webm`. */
export function normalizeAudioMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function isAllowedAudioMime(mime: string): boolean {
  return ALLOWED.includes(normalizeAudioMime(mime));
}

/**
 * Проверяет запись до расшифровки. Бросает SpeechError с причиной, по
 * которой вызывающий подберёт текст из SPEECH_ERRORS.
 *
 * Порядок проверок — от самого дешёвого к самому неприятному для человека:
 * формат он не выбирал (это решил его клиент), а длительность выбрал сам, и
 * сказать про неё надо в первую очередь.
 */
export function checkAudio(input: Pick<SpeechInput, "mime" | "durationSec"> & { data: { length: number } }): void {
  if (input.durationSec !== undefined && input.durationSec > MAX_DURATION_SEC) {
    throw new SpeechError(`audio too long: ${input.durationSec}s`, "too_long");
  }
  if (input.data.length > MAX_AUDIO_BYTES) {
    throw new SpeechError(`audio too large: ${input.data.length} bytes`, "too_large");
  }
  if (input.data.length === 0) {
    // Пустой файл — это не «речи не слышно», а обрыв где-то по пути.
    throw new SpeechError("audio is empty", "provider_error");
  }
  if (!isAllowedAudioMime(input.mime)) {
    throw new SpeechError(`unsupported audio type: ${input.mime}`, "unsupported_format");
  }
}

import { checkAudio } from "./limits.ts";
import { speechToken, speechUrl } from "./mode.ts";
import { SpeechError, type SpeechInput, type SpeechProvider, type TranscriptResult } from "./types.ts";

/**
 * Расшифровка через свою установку GigaAM-v3 (открытая ASR-модель Сбера,
 * MIT). Выбор обоснован в docs/market-research.md: по русской речи она
 * заметно точнее whisper-large-v3, помещается на наш VPS — и, что важнее
 * всего остального, запись никуда не уезжает. Голос человека — биометрия;
 * отправлять его в чужое облако значит завести себе трансграничную передачу
 * там, где её можно просто не заводить.
 *
 * Договор с сервисом наш собственный, потому что и сервис наш: POST с телом
 * из байтов записи и `Content-Type` присланного файла, ответ — JSON
 * `{ text, confidence? }`. Ни multipart, ни base64: лишнее кодирование на
 * пути к процессу, который слушает на localhost.
 */

/**
 * Сколько ждём. GigaAM на CPU расшифровывает тридцатисекундную запись за
 * несколько секунд; двадцать даёт запас на холодный старт и не заставляет
 * человека смотреть в экран бесконечно. За этим пределом ответ всё равно
 * опоздает: Telegram к тому времени успеет переспросить.
 */
const TIMEOUT_MS = 20_000;

export class GigaamSpeechProvider implements SpeechProvider {
  async transcribe(input: SpeechInput): Promise<TranscriptResult> {
    checkAudio(input);

    const url = speechUrl();
    const token = speechToken();

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": input.mime,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Buffer — это Uint8Array, но у него может быть свой offset в общем
        // пуле: копия гарантирует, что уедут именно наши байты.
        body: new Uint8Array(input.data),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Обрыв, отказ в соединении, наш собственный таймаут — для человека это
      // одно и то же: сейчас не получилось.
      throw new SpeechError(`speech service unreachable: ${error instanceof Error ? error.message : error}`, "provider_error");
    }

    if (!response.ok) {
      throw new SpeechError(`speech service returned ${response.status}`, "provider_error");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SpeechError("speech service returned malformed JSON", "provider_error");
    }

    const text = extractText(payload);
    // Пустая расшифровка — не сбой: в записи не было речи. Отдельная причина
    // нужна, чтобы сказать человеку «не слышно», а не «сервис недоступен».
    if (!text) throw new SpeechError("no speech detected", "empty");

    const confidence = extractConfidence(payload);
    return confidence === null ? { text } : { text, confidence };
  }
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as { text?: unknown }).text;
  return typeof value === "string" ? value.trim() : "";
}

function extractConfidence(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { confidence?: unknown }).confidence;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

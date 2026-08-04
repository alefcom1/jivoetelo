import { DisabledSpeechProvider } from "./disabled.ts";
import { GigaamSpeechProvider } from "./gigaam.ts";
import { MockSpeechProvider } from "./mock.ts";
import { resolveSpeechMode } from "./mode.ts";
import type { SpeechProvider } from "./types.ts";

let provider: SpeechProvider | null = null;

/**
 * Провайдер расшифровки — по режиму из `resolveSpeechMode`:
 * - `gigaam` — задан SPEECH_URL: настоящая расшифровка на своём сервисе;
 * - `mock` — детерминированный текст без сети, для разработки;
 * - `off` — честный отказ; бот и Mini App предложат текст или фото.
 */
export function getSpeechProvider(): SpeechProvider {
  if (provider) return provider;

  switch (resolveSpeechMode()) {
    case "mock": provider = new MockSpeechProvider(); break;
    case "off": provider = new DisabledSpeechProvider(); break;
    default: provider = new GigaamSpeechProvider();
  }
  return provider;
}

/** Для тестов: забыть выбранного провайдера, чтобы перечитать окружение. */
export function resetSpeechProvider(): void {
  provider = null;
}

export { isSpeechEnabled } from "./mode.ts";
export { resolveSpeechMode } from "./mode.ts";
export { checkAudio, MAX_AUDIO_BYTES, MAX_DURATION_SEC, isAllowedAudioMime, normalizeAudioMime } from "./limits.ts";
export { SPEECH_ERRORS, SpeechError } from "./types.ts";
export type { SpeechFailure, SpeechInput, SpeechProvider, TranscriptResult } from "./types.ts";

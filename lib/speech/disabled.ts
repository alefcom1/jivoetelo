import { SpeechError, type SpeechProvider, type TranscriptResult } from "./types.ts";

/**
 * Расшифровка выключена (`SPEECH_PROVIDER=off` или не задан SPEECH_URL).
 *
 * Отказ идёт обычным путём ошибки, а не «пустой расшифровкой»: пустой текст
 * означает «речи не слышно», и человек полез бы перезаписывать голосовое,
 * которое всё равно некому разобрать.
 */
export class DisabledSpeechProvider implements SpeechProvider {
  async transcribe(): Promise<TranscriptResult> {
    throw new SpeechError("speech recognition is disabled", "disabled");
  }
}

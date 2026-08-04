"use client";

// Кнопка записи голосом в Mini App.
//
// Вся работа с микрофоном — в общем хуке (app/use-voice-recorder.ts): те же
// правила действуют в веб-кабинете, и разъехаться им нельзя. Здесь только
// разметка Telegram.
//
// Расшифровка попадает в поле ввода, а не сразу в разбор. Распознавание
// ошибается, «сто» и «сто пятьдесят» на слух рядом, и увидеть текст до того,
// как он станет калориями, человек должен обязательно.

import { useVoiceRecorder } from "../use-voice-recorder";
import { transcribeAudio } from "./api";
import { haptic } from "./telegram";

export function VoiceInput({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const { state, error, seconds, supported, start, stop } = useVoiceRecorder({
    upload: async (blob) => (await transcribeAudio(blob)).text,
    onText,
    haptic,
  });

  if (supported === null) return null;

  // Молча ничего не показывать нельзя: человек ищет кнопку, о которой знает
  // из бота. Но и кнопку, которая заведомо не сработает, показывать незачем.
  if (!supported) {
    return <p className="tg-hint">Запись голосом в этом браузере недоступна — опишите еду словами или пришлите голосовое боту.</p>;
  }

  return <div className="tg-voice">
    {state === "recording"
      ? <button className="tg-voice-button tg-voice-button--live" onClick={stop}>
          <span className="tg-voice-dot" aria-hidden="true" />
          Остановить · {seconds} с
        </button>
      : <button className="tg-voice-button" onClick={() => void start()} disabled={disabled || state === "sending"}>
          🎤 {state === "sending" ? "Расшифровываем…" : "Сказать голосом"}
        </button>}

    {state === "recording" && <p className="tg-hint">
      Скажите, что и сколько съели. Например: «овсянка на воде, граммов двести, и банан».
    </p>}
    {error && <p className="tg-error">{error}</p>}
  </div>;
}

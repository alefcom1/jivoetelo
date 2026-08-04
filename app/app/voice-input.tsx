"use client";

// Кнопка записи голосом в веб-кабинете.
//
// Та же возможность, что в Mini App и в боте: паритет клиентов — не
// вежливость, а условие того, чтобы человек не выбирал между «удобно» и
// «привычно». Работа с микрофоном — в общем хуке (app/use-voice-recorder.ts),
// здесь только разметка кабинета.

import { useVoiceRecorder } from "../use-voice-recorder";

/** Отправка записи на расшифровку. Авторизация — сессионная cookie. */
async function upload(blob: Blob): Promise<string> {
  const formData = new FormData();
  // Имя файла обязательно: без него часть серверов видит поле как строку.
  formData.set("audio", blob, "voice.webm");
  const response = await fetch("/api/transcribe", { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Не получилось расшифровать.");
  }
  return typeof payload.text === "string" ? payload.text : "";
}

export function VoiceInput({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const { state, error, seconds, supported, start, stop } = useVoiceRecorder({ upload, onText });

  if (supported === null) return null;

  if (!supported) {
    return <p className="field-note">Запись голосом в этом браузере недоступна — опишите еду словами.</p>;
  }

  return <div className="voice-input">
    {state === "recording"
      ? <button type="button" className="voice-button voice-button--live" onClick={stop}>
          <span className="voice-dot" aria-hidden="true" />
          Остановить · {seconds} с
        </button>
      : <button type="button" className="voice-button" onClick={() => void start()} disabled={disabled || state === "sending"}>
          🎤 {state === "sending" ? "Расшифровываем…" : "Сказать голосом"}
        </button>}

    {state === "recording" && <p className="field-note">
      Скажите, что и сколько съели. Например: «овсянка на воде, граммов двести, и банан».
    </p>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}

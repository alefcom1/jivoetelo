"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_DURATION_SEC } from "@/lib/speech/limits";

/**
 * Запись голосом — одинаково для веба и Mini App.
 *
 * ## Почему общий модуль
 *
 * Ровно та же причина, что у `use-camera.ts`. Запись нужна в двух местах:
 * на вкладке «Камера» в Telegram и в форме добавления еды в кабинете.
 * Оформление разное, правила работы с микрофоном одни и те же, и цена их
 * расхождения — не «некрасиво», а «индикатор записи горит после того, как
 * человек всё сделал».
 *
 * ## Почему не Web Speech API
 *
 * Он не работает внутри вебвью Telegram (docs/market-research.md). Кнопка,
 * построенная на нём, молча не делала бы ничего у половины людей — а
 * поддерживать два разных способа записи в двух клиентах значит гарантированно
 * их развести. Здесь MediaRecorder: запись уходит на наш сервер и
 * расшифровывается там же, где голосовые из бота.
 *
 * ## Что важно не забыть
 *
 * **Гасить микрофон.** Дорожки останавливаются и после отправки, и при
 * размонтировании. Второе не перестраховка: вкладка Mini App размонтируется
 * при переключении, и без зачистки запись продолжалась бы на экране, которого
 * уже нет.
 *
 * **Отправлять из onstop.** Только там последний кусок уже в буфере. Отправка
 * сразу после `stop()` регулярно уносит запись без её конца.
 *
 * **Обрывать долгую запись.** Автостоп на MAX_DURATION_SEC — забота о
 * человеке, который забыл нажать «стоп», а не проверка: настоящий предел
 * держит размер файла на сервере, клиенту здесь верить нельзя.
 */

export type VoiceState = "idle" | "recording" | "sending";

/** Умеет ли браузер записывать звук вообще. */
function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Формат записи. Порядок важен: opus в webm или ogg сервис расшифровки
 * принимает напрямую, mp4 — запасной для Safari, где webm нет. Пустая строка
 * значит «решай сам»: у части сборок `isTypeSupported` врёт, и навязанный тип
 * там кончается пустым файлом.
 */
function pickMimeType(): string {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export type VoiceRecorderOptions = {
  /** Куда отправлять запись. Разная авторизация в вебе и в Mini App. */
  upload: (blob: Blob) => Promise<string>;
  /** Что делать с расшифровкой. */
  onText: (text: string) => void;
  /** Отклик устройства на нажатие — есть только в Telegram. */
  haptic?: (kind: "tap" | "success" | "error") => void;
};

export function useVoiceRecorder({ upload, onText, haptic }: VoiceRecorderOptions) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  /**
   * null — ещё не знаем. Отрисовать на первом кадре нельзя ни то ни другое:
   * на сервере MediaRecorder не существует вовсе, и любое предположение
   * означало бы мигание — то кнопка, то объяснение вместо неё.
   */
  const [supported, setSupported] = useState<boolean | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Колбэки в ref: они меняются на каждый рендер родителя, а пересоздавать
  // из-за этого обработчики рекордера незачем.
  const uploadRef = useRef(upload);
  const onTextRef = useRef(onText);
  const hapticRef = useRef(haptic);
  useEffect(() => {
    uploadRef.current = upload;
    onTextRef.current = onText;
    hapticRef.current = haptic;
  });

  // Проверка отложена на кадр — тот же приём, что в useInsideTelegram:
  // синхронный setState прямо в теле эффекта запрещён правилом
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    const id = setTimeout(() => setSupported(canRecord()), 0);
    return () => clearTimeout(id);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => releaseStream, [releaseStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    hapticRef.current?.("tap");
    setState("sending");
    // Сама отправка — в onstop: только там последний кусок уже в буфере.
    recorder.stop();
  }, []);

  const send = useCallback(async (mimeType: string) => {
    releaseStream();
    // Тип берём у самого рекордера: он мог выбрать не тот, что мы просили.
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    chunksRef.current = [];

    if (blob.size === 0) {
      setState("idle");
      setError("Запись не получилась. Попробуйте ещё раз.");
      return;
    }

    try {
      const text = await uploadRef.current(blob);
      hapticRef.current?.("success");
      onTextRef.current(text);
      setState("idle");
    } catch (failure) {
      hapticRef.current?.("error");
      setState("idle");
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : "Не получилось расшифровать. Попробуйте ещё раз.",
      );
    }
  }, [releaseStream]);

  const start = useCallback(async () => {
    setError(null);
    setSeconds(0);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Отказ в доступе и отсутствие микрофона снаружи неразличимы, и обе
      // причины человек лечит одинаково — в настройках.
      setError("Нет доступа к микрофону. Разрешите запись в настройках — или опишите еду текстом.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => { void send(recorder.mimeType || mimeType); };
    recorderRef.current = recorder;
    recorder.start();
    hapticRef.current?.("tap");
    setState("recording");
  }, [send]);

  // Секундомер и автостоп.
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        if (next >= MAX_DURATION_SEC) stop();
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, stop]);

  return { state, error, seconds, supported, start, stop };
}

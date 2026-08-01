"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Живой поток с камеры и кадр из него — одинаково для веба и Mini App.
 *
 * ## Почему общий модуль
 *
 * Съёмка нужна в двух местах: на вкладке «Камера» в Mini App и в веб-кабинете,
 * где `<input capture>` бесполезен (на десктопе атрибут игнорируется вовсе).
 * Оформление у них разное — видоискатель во весь экран против кнопки в форме, —
 * а правила работы с потоком одни и те же, и разъехаться им нельзя: цена
 * расхождения не «некрасиво», а «индикатор камеры горит после того, как человек
 * всё сделал».
 *
 * ## Что здесь важно не забыть
 *
 * **Гасить камеру.** Поток останавливается и по явному вызову `stop`, и при
 * размонтировании. Второе — не перестраховка: вкладка Mini App размонтируется
 * при переключении на «Сегодня», и без зачистки камера продолжала бы работать
 * на экране, где её нет.
 *
 * **Не трогать состояние после размонтирования.** Зачистка останавливает треки
 * напрямую по ссылке, а не через `stop`: тот вызывает `setState`, и React
 * справедливо ругался бы на обновление размонтированного компонента.
 *
 * **Сжимать кадр.** Камера отдаёт мегапиксели, а на сервере лимит восемь
 * мегабайт (`MAX_PHOTO_BYTES`). JPEG качества 0.85 с ограничением длинной
 * стороны укладывается с запасом, и модели этого разрешения хватает — она
 * читает состав тарелки, а не этикетки.
 */

/** Длинная сторона снимка. Больше модели не нужно, а весит заметно дороже. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

export type CameraState =
  /** Ещё не просили доступ. */
  | "idle"
  /** Просим доступ: в этот момент браузер и показывает своё окно. */
  | "starting"
  /** Поток идёт, можно снимать. */
  | "live"
  /** Человек или настройки браузера отказали — предлагать снова бесполезно. */
  | "denied"
  /** Камеры нет или браузер её не отдаёт. Совет тот же, причина другая. */
  | "unavailable";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState("idle");
  }, []);

  // Зачистка при размонтировании — напрямую по ссылке, без setState.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // Поддержку проверяем здесь, а не при отрисовке: на сервере `navigator`
    // нет, и проверка при рендере разошлась бы с гидратацией.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    setState("starting");
    try {
      // `environment` — пожелание, а не требование: на ноутбуке задней камеры
      // нет, и со строгим требованием запрос упал бы вместо того, чтобы взять
      // единственную имеющуюся.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setState("live");
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      // Отказ в доступе и отсутствие камеры — разные вещи, и советы разные.
      const denied = cause instanceof DOMException
        && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setState(denied ? "denied" : "unavailable");
    }
  }, []);

  // Поток привязываем в эффекте, а не сразу после getUserMedia: элемента
  // <video> в этот момент ещё нет, он появляется вместе с состоянием «live».
  // Соблазн отложить привязку через requestAnimationFrame — ловушка: в фоновой
  // вкладке кадры не идут, и человек, отвлёкшийся на другое приложение,
  // вернулся бы к чёрному прямоугольнику. Эффект отрабатывает независимо от
  // отрисовки.
  useEffect(() => {
    const video = videoRef.current;
    if (state !== "live" || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      // Автовоспроизведение может не запуститься, но поток уже привязан:
      // первый кадр появится, а дальше поможет нажатие кнопки съёмки.
    });
  }, [state]);

  /** Кадр из потока. `null` — кадра ещё нет или его не удалось закодировать. */
  const shoot = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;

    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    return blob ? new File([blob], "camera.jpg", { type: "image/jpeg" }) : null;
  }, []);

  return { videoRef, state, start, stop, shoot };
}

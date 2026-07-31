"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Съёмка еды камерой прямо в браузере.
 *
 * ## Зачем понадобилось
 *
 * В веб-версии кнопка «Фото» открывала только выбор файла. На телефоне это
 * ещё сносно — системный выбор предлагает снять кадр, — а на ноутбуке значило
 * «сфотографируйте на что-нибудь другое, перекиньте файл и выберите его».
 * Человек с камерой в крышке ноутбука не мог сфотографировать тарелку.
 *
 * `<input capture>` тут не помогает: на десктопе атрибут игнорируется. Нужен
 * `getUserMedia`, то есть живой поток с камеры и кадр из него.
 *
 * ## Что здесь важно не забыть
 *
 * **Гасить камеру.** Поток надо остановить и при закрытии, и при уходе со
 * страницы, иначе индикатор камеры горит после того, как человек всё сделал, —
 * и это выглядит ровно так, как выглядит: будто мы продолжаем снимать.
 * Поэтому остановка живёт в `useEffect` с зачисткой и вызывается на каждом
 * выходе из режима съёмки.
 *
 * **Не спрашивать разрешение заранее.** Браузер покажет запрос в тот момент,
 * когда мы позовём `getUserMedia`, — значит звать нужно по нажатию кнопки, а
 * не при загрузке страницы. Иначе человек видит окно «разрешить камеру» до
 * того, как понял, зачем.
 *
 * **Сжимать кадр.** Камера ноутбука отдаёт мегапиксели, а на сервере лимит
 * восемь мегабайт (`MAX_PHOTO_BYTES`). JPEG качества 0.85 с ограничением
 * длинной стороны укладывается с запасом, и модели этого разрешения хватает —
 * она читает состав тарелки, а не этикетки.
 */

/** Длинная сторона снимка. Больше модели не нужно, а весит заметно дороже. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

type Props = {
  /** Готовый кадр. Дальше он идёт тем же путём, что и выбранный файл. */
  onCapture: (file: File) => void;
};

export function CameraCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Гасим камеру, если человек ушёл со страницы, не закрыв съёмку.
  useEffect(() => stop, [stop]);

  // Поток привязываем в эффекте, а не сразу после getUserMedia: элемента
  // <video> в этот момент ещё нет, он появляется вместе с `open`. Соблазн
  // отложить привязку через requestAnimationFrame — ловушка: в фоновой
  // вкладке кадры не идут, и человек, отвлёкшийся на другую вкладку, вернулся
  // бы к чёрному прямоугольнику. Эффект отрабатывает независимо от отрисовки.
  useEffect(() => {
    const video = videoRef.current;
    if (!open || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      // Автовоспроизведение может не запуститься, но поток уже привязан:
      // первый кадр появится, а дальше поможет клик по кнопке съёмки.
    });
  }, [open]);

  async function start() {
    setError(null);
    // Поддержку проверяем здесь, а не при отрисовке. На сервере `navigator`
    // нет, и любая проверка при рендере разошлась бы с гидратацией; а кнопка,
    // появляющаяся через мгновение после загрузки, мигает. Браузер без камеры
    // получит внятный отказ по нажатию — это лучше, чем отсутствующая кнопка
    // и непонятно почему.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Этот браузер не умеет снимать. Выберите готовый снимок — это то же самое.");
      return;
    }
    try {
      // `environment` — пожелание, а не требование: на ноутбуке задней камеры
      // нет, и со строгим требованием запрос упал бы вместо того, чтобы взять
      // единственную имеющуюся.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setOpen(true);
    } catch (cause) {
      stop();
      // Отказ в доступе и отсутствие камеры — разные вещи, и советы разные.
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setError(
        denied
          ? "Браузер не дал доступ к камере. Разрешите его в настройках сайта — или выберите готовый снимок."
          : "Камера не нашлась. Выберите готовый снимок — это то же самое.",
      );
    }
  }

  function close() {
    stop();
    setOpen(false);
  }

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Не получилось сохранить кадр. Попробуйте ещё раз или выберите готовый снимок.");
          return;
        }
        onCapture(new File([blob], "camera.jpg", { type: "image/jpeg" }));
        close();
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  return <div className="camera">
    {!open
      ? <button type="button" className="camera-open" onClick={() => void start()}>Снять камерой</button>
      : <div className="camera-live">
          {/* Без audio: звук нам не нужен, а разрешение на микрофон пугает. */}
          <video ref={videoRef} playsInline muted />
          <div className="camera-actions">
            <button type="button" className="black-button" onClick={shoot}>Снять кадр</button>
            <button type="button" className="link-button" onClick={close}>Отмена</button>
          </div>
        </div>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}

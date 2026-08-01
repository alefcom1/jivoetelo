"use client";

import { useState } from "react";
import { useCamera } from "../../use-camera";

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
 * `getUserMedia`, то есть живой поток с камеры и кадр из него, — им занимается
 * общий с Mini App хук `useCamera`.
 *
 * ## Чем отличается от Mini App
 *
 * Там камера включается сама при открытии вкладки: человек нажал «Камера»,
 * намерение выражено. Здесь съёмка — один из способов на форме добавления
 * рядом с текстом и выбором файла, и включать её самой значило бы показывать
 * запрос браузера человеку, который пришёл написать «два сырника».
 */

export function CameraCapture({ onCapture }: { onCapture: (file: File) => void }) {
  const { videoRef, state, start, stop, shoot } = useCamera();
  const [captureFailed, setCaptureFailed] = useState(false);

  async function take() {
    const file = await shoot();
    if (!file) { setCaptureFailed(true); return; }
    onCapture(file);
    stop();
  }

  const error = captureFailed
    ? "Не получилось сохранить кадр. Попробуйте ещё раз или выберите готовый снимок."
    : state === "denied"
    ? "Браузер не дал доступ к камере. Разрешите его в настройках сайта — или выберите готовый снимок."
    : state === "unavailable"
    ? "Камера не нашлась. Выберите готовый снимок — это то же самое."
    : null;

  return <div className="camera">
    {state !== "live"
      ? <button type="button" className="camera-open" disabled={state === "starting"}
          onClick={() => { setCaptureFailed(false); void start(); }}>
          {state === "starting" ? "Включаем камеру…" : "Снять камерой"}
        </button>
      : <div className="camera-live">
          {/* Без audio: звук нам не нужен, а разрешение на микрофон пугает. */}
          <video ref={videoRef} playsInline muted />
          <div className="camera-actions">
            <button type="button" className="black-button" onClick={() => void take()}>Снять кадр</button>
            <button type="button" className="link-button" onClick={stop}>Отмена</button>
          </div>
        </div>}
    {error && <p className="form-error">{error}</p>}
  </div>;
}

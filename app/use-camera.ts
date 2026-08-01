"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { preferredCamera, toCameraDevices, type CameraDevice } from "@/lib/camera-devices";

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
 *
 * **Не хвататься за первую попавшуюся камеру.** На ноутбуке умолчание системы
 * регулярно оказывается виртуальной камерой (OBS и подобные), и человек видит
 * заставку стрима вместо тарелки. Разбор этого — в lib/camera-devices.ts.
 */

/** Длинная сторона снимка. Больше модели не нужно, а весит заметно дороже. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

/** Выбранная камера переживает перезаход: переключать её каждый раз — мучение. */
const STORAGE_KEY = "jt.camera.deviceId";

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

function readStoredDeviceId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Приватный режим и заблокированное хранилище — не повод не включать камеру.
    return null;
  }
}

function storeDeviceId(deviceId: string | null): void {
  try {
    if (deviceId) window.localStorage.setItem(STORAGE_KEY, deviceId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // См. выше: выбор просто не переживёт перезаход.
  }
}

/** Ограничения запроса: явно выбранное устройство важнее пожелания о задней камере. */
function constraintsFor(deviceId: string | null): MediaStreamConstraints {
  return {
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1920 } }
      // `environment` — пожелание, а не требование: на ноутбуке задней камеры
      // нет, и со строгим требованием запрос упал бы вместо того, чтобы взять
      // единственную имеющуюся.
      : { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
    audio: false,
  };
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  /** Автоподмену виртуальной камеры делаем один раз за жизнь экрана. */
  const autoSwitchedRef = useRef(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopTracks();
    setState("idle");
  }, [stopTracks]);

  // Зачистка при размонтировании — напрямую по трекам, без setState.
  useEffect(() => stopTracks, [stopTracks]);

  const open = useCallback(async (wanted: string | null): Promise<MediaStream | null> => {
    // Поддержку проверяем здесь, а не при отрисовке: на сервере `navigator`
    // нет, и проверка при рендере разошлась бы с гидратацией.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return null;
    }
    setState("starting");
    try {
      return await navigator.mediaDevices.getUserMedia(constraintsFor(wanted));
    } catch (cause) {
      const denied = cause instanceof DOMException
        && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      if (denied) { setState("denied"); return null; }
      // Запомненное устройство могло исчезнуть — отключили вебкамеру, закрыли
      // OBS. Это не повод остаться без камеры вовсе: пробуем ещё раз без него.
      if (wanted) {
        storeDeviceId(null);
        try {
          return await navigator.mediaDevices.getUserMedia(constraintsFor(null));
        } catch {
          setState("unavailable");
          return null;
        }
      }
      setState("unavailable");
      return null;
    }
  }, []);

  /**
   * Список камер. Названия доступны только после выдачи доступа — поэтому
   * читать их раньше, чем поток пошёл, бессмысленно: вернутся пустые строки.
   */
  const listDevices = useCallback(async (): Promise<CameraDevice[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return toCameraDevices(await navigator.mediaDevices.enumerateDevices());
  }, []);

  const attach = useCallback((stream: MediaStream, list: CameraDevice[]) => {
    const track = stream.getVideoTracks()[0];
    streamRef.current = stream;
    setDevices(list);
    setDeviceId(track?.getSettings().deviceId ?? null);
    setState("live");
  }, []);

  /**
   * Запуск потока с уходом от виртуальной камеры.
   *
   * Уход живёт здесь, а не отдельным эффектом по готовому состоянию: там
   * получился бы цикл (запуск → чтение устройств → переключение → запуск),
   * и React справедливо ругался бы на смену состояния прямо в эффекте.
   * Линейный порядок читается проще и переключает камеру ровно один раз.
   *
   * Выбор, сделанный человеком руками, не трогаем вовсе — только умолчание
   * системы, которое на ноутбуке регулярно оказывается OBS.
   */
  const start = useCallback(async () => {
    const stored = readStoredDeviceId();
    const stream = await open(stored);
    if (!stream) return;

    const list = await listDevices();
    if (stored || autoSwitchedRef.current) { attach(stream, list); return; }
    autoSwitchedRef.current = true;

    const track = stream.getVideoTracks()[0];
    const better = preferredCamera(list, track?.label ?? "");
    if (!better || better === track?.getSettings().deviceId) { attach(stream, list); return; }

    stream.getTracks().forEach((t) => t.stop());
    const swapped = await open(better);
    // Не открылась — значит с ней что-то не так; возвращаемся к умолчанию,
    // пусть даже виртуальному: заставка стрима лучше чёрного экрана.
    if (!swapped) { const fallback = await open(null); if (fallback) attach(fallback, list); return; }
    storeDeviceId(better);
    attach(swapped, list);
  }, [open, attach, listDevices]);

  /** Переключение на другую камеру: старый поток гасим до открытия нового. */
  const switchTo = useCallback(async (nextId: string) => {
    stopTracks();
    const stream = await open(nextId);
    if (!stream) return;
    storeDeviceId(nextId);
    attach(stream, await listDevices());
  }, [open, attach, listDevices, stopTracks]);

  // Поток привязываем в эффекте, а не сразу после getUserMedia: элемента
  // <video> в этот момент ещё нет, он появляется вместе с состоянием «live».
  // Соблазн отложить привязку через requestAnimationFrame — ловушка: в фоновой
  // вкладке кадры не идут, и человек, отвлёкшийся на другое приложение,
  // вернулся бы к чёрному прямоугольнику. Эффект отрабатывает независимо от
  // отрисовки. Ключ по deviceId — чтобы перепривязать после переключения.
  useEffect(() => {
    const video = videoRef.current;
    if (state !== "live" || !video || !streamRef.current) return;
    if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
    void video.play().catch(() => {
      // Автовоспроизведение может не запуститься, но поток уже привязан:
      // первый кадр появится, а дальше поможет нажатие кнопки съёмки.
    });
  }, [state, deviceId]);

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

  return { videoRef, state, devices, deviceId, start, stop, switchTo, shoot };
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  frameAdvice,
  frameDifference,
  frameStats,
  readiness,
  toGrayscale,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  type FrameAdvice,
  type Readiness,
} from "@/lib/frame-quality";

/**
 * Наблюдение за живым кадром: резкость, свет, движение — и автоспуск.
 *
 * ## Зачем автоспуск
 *
 * Нажать кнопку, держа телефон над тарелкой одной рукой, — это как раз тот
 * момент, когда кадр сдвигается и смазывается. Спуск в момент, когда телефон
 * уже замер, даёт кадр лучше, чем спуск по нажатию, и при этом не требует от
 * человека ничего.
 *
 * ## Правила, которые здесь неочевидны
 *
 * **Пауза после запуска потока.** Первые кадры камера отдаёт, пока ещё сама
 * настраивает фокус и экспозицию: они резкие ровно настолько, чтобы обмануть
 * порог, и снимок выходит мутным. Отсюда SETTLE_MS.
 *
 * **Замер подряд, а не однократный.** Одиночное «движение ниже порога»
 * случается и посреди поворота телефона. Нужна серия — STEADY_FRAMES подряд.
 *
 * **Видимый обратный отсчёт.** Кадр, снятый без предупреждения, ощущается
 * как сбой, а не как помощь. Кольцо у затвора заполняется COUNTDOWN_MS, и
 * этого хватает, чтобы понять, что сейчас произойдёт, и остановить.
 *
 * **Отмена выключает автоспуск до конца экрана.** Человек, отменивший
 * автоспуск, отменил его не на одну секунду: снимать через раз против воли
 * хуже, чем не снимать вовсе.
 *
 * **Измерение — на rAF.** Не по таймеру: в фоне rAF останавливается сам, и
 * камера не молотит вхолостую, пока приложение свёрнуто.
 */

/** Частота измерений. Восьми раз в секунду хватает: кадр меняется медленнее. */
const SAMPLE_INTERVAL_MS = 125;
/** Сколько ждать после запуска потока, пока камера настроит фокус и экспозицию. */
const SETTLE_MS = 1200;
/** Сколько подряд измерений должны сказать «замер», чтобы начать отсчёт. */
const STEADY_FRAMES = 5;
/** Длина видимого отсчёта до спуска. */
export const COUNTDOWN_MS = 700;

/**
 * Сколько измерений подряд должны сказать одно и то же, прежде чем подсказка
 * появится на экране.
 *
 * Без этого совет мигал бы восемь раз в секунду: «держите ровнее» — «камера
 * наводится» — «держите ровнее». Мигающий текст читать нельзя, а исправлять
 * по нему нечего. Полсекунды достаточно, чтобы причина устоялась.
 *
 * Снимается подсказка сразу, без выдержки: человек исправил — надо ответить
 * немедленно, иначе он решит, что не помогло, и продолжит крутить телефон.
 */
const ADVICE_HOLD = 4;

export type FrameWatch = {
  /** Последняя оценка кадра. `null` — измерений ещё не было. */
  readiness: Readiness | null;
  /** Что мешает снять — уже устоявшееся, годное для показа. */
  advice: FrameAdvice;
  /** 0..1 — заполненность кольца отсчёта. 0 означает «отсчёт не идёт». */
  countdown: number;
  /** Автоспуск включён и не отменён. */
  auto: boolean;
  /** Отменить автоспуск до конца жизни экрана. */
  cancelAuto: () => void;
};

export function useFrameWatch({
  videoRef,
  active,
  enabled,
  onFire,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Поток идёт и кадр виден. Вне этого не измеряем вовсе. */
  active: boolean;
  /** Автоспуск разрешён (человек не отключил его в настройках). */
  enabled: boolean;
  onFire: () => void;
}): FrameWatch {
  const [readinessState, setReadinessState] = useState<Readiness | null>(null);
  const [advice, setAdvice] = useState<FrameAdvice>("ready");
  const [countdown, setCountdown] = useState(0);
  const [auto, setAuto] = useState(true);

  // Всё, что меняется каждый кадр, живёт в ref: перерисовывать компонент восемь
  // раз в секунду ради чисел, которых на экране нет, незачем.
  const prevGrayRef = useRef<Uint8ClampedArray | null>(null);
  const adviceHoldRef = useRef<{ kind: FrameAdvice; count: number }>({ kind: "ready", count: 0 });
  const steadyCountRef = useRef(0);
  const countdownStartRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const onFireRef = useRef(onFire);
  // Обновление ссылки — в эффекте, а не при отрисовке: во время рендера
  // ref трогать нельзя, а нам нужен всегда свежий обработчик, не пересоздавая
  // при этом цикл измерений на каждое изменение пропа.
  useEffect(() => { onFireRef.current = onFire; });

  /** Взведён ли автоспуск: и разрешён настройкой, и не отменён рукой. */
  const armed = enabled && auto;

  /**
   * Сброс при смене активности — правкой состояния прямо при отрисовке.
   *
   * Это не хак, а описанный в документации React способ подстроить состояние
   * под изменившийся проп. В эффекте то же самое дало бы лишний проход
   * отрисовки, и на экране на кадр успело бы мелькнуть кольцо отсчёта от
   * прошлого захода.
   */
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setCountdown(0);
    setReadinessState(null);
    setAdvice("ready");
  }

  useEffect(() => {
    if (!active) {
      // Экран ушёл — забываем всё: вернувшись, отсчёт должен начаться заново,
      // а не продолжиться с середины по кадру, снятому минуту назад.
      prevGrayRef.current = null;
      steadyCountRef.current = 0;
      adviceHoldRef.current = { kind: "ready", count: 0 };
      countdownStartRef.current = null;
      firedRef.current = false;
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    let raf = 0;
    let lastSample = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - lastSample < SAMPLE_INTERVAL_MS) return;
      lastSample = now;

      const video = videoRef.current;
      if (!video?.videoWidth) return;

      context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const gray = toGrayscale(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
      const previous = prevGrayRef.current;
      prevGrayRef.current = gray;
      // Первый кадр сравнивать не с чем: считаем сценой в движении, чтобы
      // отсчёт не начался с него.
      const motion = previous ? frameDifference(previous, gray) : 1;

      const stats = frameStats(gray, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const verdict = readiness(stats, motion);
      setReadinessState(verdict);

      // Совет показываем только когда причина устоялась, а снимаем сразу:
      // подтверждать исправление незачем, оно уже видно в кадре.
      const kind = frameAdvice(stats, motion);
      const hold = adviceHoldRef.current;
      adviceHoldRef.current = kind === hold.kind ? { kind, count: hold.count + 1 } : { kind, count: 1 };
      if (kind === "ready") setAdvice("ready");
      else if (adviceHoldRef.current.count >= ADVICE_HOLD) setAdvice(kind);

      if (!armed || firedRef.current || now - startedAt < SETTLE_MS) return;

      if (!verdict.ready) {
        steadyCountRef.current = 0;
        if (countdownStartRef.current !== null) {
          countdownStartRef.current = null;
          setCountdown(0);
        }
        return;
      }

      steadyCountRef.current++;
      if (steadyCountRef.current < STEADY_FRAMES) return;

      if (countdownStartRef.current === null) countdownStartRef.current = now;
      const progress = (now - countdownStartRef.current) / COUNTDOWN_MS;
      if (progress < 1) { setCountdown(progress); return; }

      firedRef.current = true;
      setCountdown(0);
      onFireRef.current();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, armed, videoRef]);

  return {
    readiness: readinessState,
    advice,
    countdown,
    auto: armed,
    cancelAuto: () => { setAuto(false); setCountdown(0); },
  };
}

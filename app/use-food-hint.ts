"use client";

import { useEffect, useRef, useState } from "react";
import { foodScore, softmax } from "@/lib/food-presence";

/**
 * «Вижу еду» — распознавание прямо в браузере.
 *
 * ## Что это стоит
 *
 * Рантайм ONNX и модель — около 6,5 МБ по сети в сжатом виде и один прогон
 * порядка 70 мс на процессоре ноутбука, заметно больше на телефоне. Это
 * дорого, и потому:
 *
 * - ничего не грузится, пока человек не открыл камеру и не оставил настройку
 *   включённой (см. camera-prefs.ts) — выключенная настройка означает, что
 *   ни один байт не поедет;
 * - на экономном режиме и медленной сети не грузится вовсе: тянуть шесть
 *   мегабайт на 3G ради подсказки — плохая сделка, которую человек не
 *   просил;
 * - считаем два раза в секунду, а не с каждым кадром: подсказка не должна
 *   греть телефон.
 *
 * ## Что это НЕ делает
 *
 * Не называет блюдо. Модель обучена на ImageNet, где нет ни борща, ни гречки,
 * ни плова, — она отвечает «похоже на еду», и только. Состав определяет
 * модель на сервере после снимка.
 *
 * И ничего не запрещает. Подсказка поощряет снимок и не может его
 * заблокировать: ложное «еды не вижу» на настоящей тарелке — вопрос времени,
 * и цена такой ошибки должна быть нулевой.
 */

const MODEL_URL = "/models/food/mobilenetv2-12-int8.onnx";
const RUNTIME_URL = "/models/ort/ort.wasm.bundle.min.mjs";
const WASM_PATH = "/models/ort/";

/** Сторона входа модели. Задана самой моделью, менять нельзя. */
const SIDE = 224;
/** Нормализация ImageNet — та, с которой модель обучалась. */
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** Два раза в секунду. Чаще незачем: тарелка не убегает. */
const INTERVAL_MS = 500;

export type FoodHintState =
  /** Настройка выключена или условия не те — ничего не грузим. */
  | "off"
  /** Качаем модель. Видоискатель при этом работает как обычно. */
  | "loading"
  /** Считаем: смотрим на кадр. */
  | "ready"
  /** Не удалось — молча возвращаемся к обычной камере. */
  | "failed";

type OrtModule = {
  env: { wasm: { wasmPaths: string; numThreads: number; simd?: boolean } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create(url: string, options?: unknown): Promise<{
      inputNames: string[];
      outputNames: string[];
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>;
    }>;
  };
};

/**
 * Стоит ли вообще качать модель.
 *
 * `saveData` человек включает сам и явно просит не тратить трафик. Медленная
 * сеть — то же самое по существу: шесть мегабайт на 3G едут десятки секунд,
 * и подсказка приедет уже после того, как снимок сделан.
 */
function worthLoading(): boolean {
  const connection = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}

let runtimePromise: Promise<OrtModule> | null = null;

/** Рантайм грузится один раз на вкладку и переживает уходы с экрана. */
async function loadRuntime(): Promise<OrtModule> {
  runtimePromise ??= (async () => {
    const ort = (await import(/* webpackIgnore: true */ RUNTIME_URL)) as unknown as OrtModule;
    ort.env.wasm.wasmPaths = WASM_PATH;
    // Многопоточность требует SharedArrayBuffer, а он — заголовков COOP/COEP
    // на весь сайт. Ставить их ради подсказки нельзя: Mini App открывается
    // внутри iframe Telegram, и кросс-доменные вставки от этого ломаются.
    ort.env.wasm.numThreads = 1;
    return ort;
  })();
  return runtimePromise;
}

export function useFoodHint({
  videoRef,
  active,
  enabled,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  enabled: boolean;
}): { state: FoodHintState; score: number | null } {
  // Хранится только то, что действительно приходит извне: удалось ли поднять
  // сессию. «Выключено» и «грузим» из этого выводятся — состояние, которое
  // можно вычислить, хранить незачем, и заодно не приходится трогать его
  // прямо в эффекте.
  const [session, setSession] = useState<"idle" | "ready" | "failed">("idle");
  const [score, setScore] = useState<number | null>(null);
  const scoreRef = useRef<number | null>(null);

  // Сброс при уходе с видоискателя — правкой состояния при отрисовке, как и
  // в use-frame-watch.ts: это описанный в документации React способ
  // подстроить состояние под изменившийся проп, и он не даёт лишнего прохода.
  const on = active && enabled;
  const [wasOn, setWasOn] = useState(on);
  if (wasOn !== on) {
    setWasOn(on);
    setSession("idle");
    setScore(null);
    scoreRef.current = null;
  }

  useEffect(() => {
    if (!on) return;
    if (!worthLoading()) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const input = new Float32Array(3 * SIDE * SIDE);

    void (async () => {
      let ort: OrtModule;
      let inference: Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;
      try {
        ort = await loadRuntime();
        inference = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
      } catch {
        // Не загрузилось — молча живём без подсказки. Сообщать не о чем:
        // камера работает, снимок делается, человек ничего не потерял.
        if (!stopped) setSession("failed");
        return;
      }
      if (stopped) return;
      setSession("ready");

      const inputName = inference.inputNames[0];
      const outputName = inference.outputNames[0];
      const plane = SIDE * SIDE;

      const step = async () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video?.videoWidth) {
          context.drawImage(video, 0, 0, SIDE, SIDE);
          const { data } = context.getImageData(0, 0, SIDE, SIDE);
          for (let i = 0, p = 0; i < plane; i++, p += 4) {
            input[i] = (data[p] / 255 - MEAN[0]) / STD[0];
            input[plane + i] = (data[p + 1] / 255 - MEAN[1]) / STD[1];
            input[2 * plane + i] = (data[p + 2] / 255 - MEAN[2]) / STD[2];
          }
          try {
            const result = await inference.run({
              [inputName]: new ort.Tensor("float32", input, [1, 3, SIDE, SIDE]),
            });
            if (stopped) return;
            const next = foodScore(softmax(result[outputName].data));
            // Обновляем состояние только при заметном изменении: подсказка
            // не должна перерисовываться дважды в секунду из-за шума.
            if (scoreRef.current === null || Math.abs(next - scoreRef.current) > 0.03) {
              scoreRef.current = next;
              setScore(next);
            }
          } catch {
            if (!stopped) setSession("failed");
            return;
          }
        }
        // Следующий заход отсчитывается от конца прогона, а не от начала:
        // на медленном телефоне интервал иначе выродился бы в непрерывный
        // счёт без единой паузы.
        timer = setTimeout(() => void step(), INTERVAL_MS);
      };
      void step();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [on, videoRef]);

  // «Выключено» важнее всего остального: пока видоискателя нет, никакого
  // счёта на экране быть не должно, даже если сессия жива с прошлого раза.
  const state: FoodHintState = !on ? "off" : session === "idle" ? "loading" : session;
  return { state, score };
}

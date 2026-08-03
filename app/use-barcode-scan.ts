"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeBarcode } from "@/lib/barcode";

/**
 * Чтение штрихкода с живого видеопотока — одинаково для веба и Mini App.
 *
 * ## Почему BarcodeDetector, а не showScanQrPopup
 *
 * У Telegram есть свой сканер, и соблазн был. Но он официально описан только
 * для QR, в Desktop- и Web-клиентах не работает вовсе, а читает ли он EAN-13
 * — вопрос, на который документация не отвечает
 * (docs/market-research.md, раздел 8; диагностика — app/tg/scan-test).
 * Строить возможность на «вроде бы работает у части людей» нельзя: у
 * остальных кнопка молча не делала бы ничего.
 *
 * `BarcodeDetector` встроен в Chromium начиная с 83-й версии и есть в
 * Android WebView, на котором работает Telegram. Там, где его нет (Safari и
 * iOS-клиент Telegram), мы говорим об этом прямо и предлагаем ввести цифры
 * из-под полосок руками — их всё равно печатают на каждой упаковке.
 * Тянуть ради этого wasm-декодер в бандл не станем: он весит больше, чем всё
 * приложение, и грузился бы всем ради меньшинства.
 *
 * ## Почему подтверждение двумя кадрами
 *
 * Детектор изредка отдаёт неверный код на смазанном кадре. Контрольная цифра
 * ловит большинство таких ошибок, но не все (см. тест про перестановку в
 * tests/barcode.test.mjs). Два одинаковых чтения подряд стоят лишней десятой
 * доли секунды и убирают почти весь остаток.
 */

/** Как часто смотрим в кадр. Чаще незачем: сканирование и так занимает миг. */
const SCAN_INTERVAL_MS = 250;
/** Сколько одинаковых чтений подряд считаем подтверждением. */
const CONFIRMATIONS = 2;

/** Форматы, которые просим у детектора. Всё, что бывает на еде. */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

type Detector = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

type DetectorConstructor = {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

function detectorClass(): DetectorConstructor | null {
  const found = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return typeof found === "function" ? found : null;
}

export function useBarcodeScan({
  videoRef,
  active,
  onCode,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Смотреть ли в кадр прямо сейчас. */
  active: boolean;
  onCode: (code: string) => void;
}) {
  /** null — ещё не знаем: детектор проверяется после монтирования. */
  const [supported, setSupported] = useState<boolean | null>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; });

  useEffect(() => {
    const id = setTimeout(() => setSupported(detectorClass() !== null), 0);
    return () => clearTimeout(id);
  }, []);

  const detectorRef = useRef<Detector | null>(null);
  const lastRef = useRef<{ code: string; times: number }>({ code: "", times: 0 });

  const reset = useCallback(() => { lastRef.current = { code: "", times: 0 }; }, []);

  useEffect(() => {
    if (!active || supported !== true) return;
    const Detector = detectorClass();
    if (!Detector) return;

    // Один детектор на всё время сканирования: создание его на каждый кадр
    // заметно грузит слабый телефон.
    detectorRef.current ??= new Detector({ formats: FORMATS });
    let stopped = false;

    const timer = setInterval(async () => {
      const video = videoRef.current;
      // readyState < 2 — кадра ещё нет; отдавать детектору пустоту незачем.
      if (stopped || !video || video.readyState < 2) return;
      let found: Array<{ rawValue?: string }>;
      try {
        found = await detectorRef.current!.detect(video);
      } catch {
        // Детектор изредка отказывает на конкретном кадре — это не повод
        // прекращать: следующий обычно проходит.
        return;
      }
      if (stopped) return;

      for (const item of found) {
        const code = normalizeBarcode(item.rawValue ?? "");
        // Не прошедший контрольную цифру код молча пропускаем: сообщать о
        // каждом смазанном кадре — значит мигать ошибкой во время наводки.
        if (!code) continue;

        const last = lastRef.current;
        const times = last.code === code ? last.times + 1 : 1;
        lastRef.current = { code, times };
        if (times >= CONFIRMATIONS) {
          lastRef.current = { code: "", times: 0 };
          onCodeRef.current(code);
        }
        return;
      }
    }, SCAN_INTERVAL_MS);

    return () => { stopped = true; clearInterval(timer); };
  }, [active, supported, videoRef]);

  return { supported, reset };
}

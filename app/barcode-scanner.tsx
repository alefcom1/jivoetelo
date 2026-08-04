"use client";

// Сканер штрихкодов — один на веб-кабинет и Mini App.
//
// Общий компонент, а не два похожих, по той же причине, что и у камеры с
// микрофоном: карточка товара в базе общая, и правила её заведения не могут
// зависеть от того, из какого клиента человек держит ту же самую пачку.
// Различается только адрес точки приёма и способ авторизации — они и
// приходят параметрами.
//
// Чтение кода — в app/use-barcode-scan.ts, там же объяснено, почему
// BarcodeDetector, а не сканер Telegram.

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PORTION_G, formatBarcode, normalizeBarcode, type BarcodeProduct } from "@/lib/barcode";
import { withPluralRu } from "@/lib/plural";
import { useBarcodeScan } from "./use-barcode-scan";
import { useCamera } from "./use-camera";

/** Позиция в том виде, в каком её ждут экраны добавления еды. */
export type ScannedItem = {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
};

type Lookup =
  | { found: true; product: BarcodeProduct; pretty: string }
  | { found: false; code: string; pretty: string; region: string | null; storeInternal: boolean };

const EMPTY_FORM = { name: "", portionG: "", kcal: "", protein: "", fat: "", carbs: "", fiber: "" };

/** Число из поля: запятая как разделитель, пусто и мусор — ноль. */
function num(value: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function itemFrom(product: BarcodeProduct): ScannedItem {
  return {
    name: product.name,
    grams: product.portionG > 0 ? product.portionG : DEFAULT_PORTION_G,
    kcalPer100: product.kcalPer100,
    proteinPer100: product.proteinPer100,
    fatPer100: product.fatPer100,
    carbsPer100: product.carbsPer100,
    fiberPer100: product.fiberPer100,
    // Числа с упаковки — не догадка модели по фотографии.
    confidence: "high",
  };
}

export function BarcodeScanner({
  endpoint,
  headers,
  onItem,
  onClose,
}: {
  /** «/api/barcode» в вебе, «/api/tg/barcode» в Mini App. */
  endpoint: string;
  /** Заголовки авторизации: в вебе их нет, в Mini App — подпись initData. */
  headers?: Record<string, string>;
  onItem: (item: ScannedItem) => void;
  onClose: () => void;
}) {
  const { videoRef, state: cameraState, start, stop } = useCamera();
  const [result, setResult] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  /** Ручной ввод цифр: нужен и без детектора, и когда код не читается. */
  const [manualCode, setManualCode] = useState("");

  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(`${endpoint}${path}`, {
        ...init,
        headers: { ...headers, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Не получилось.");
      return payload;
    },
    [endpoint, headers],
  );

  const handleCode = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const found = (await request(`?code=${encodeURIComponent(code)}`)) as Lookup;
      setResult(found);
      // Форму заводим сразу: у ненайденного кода следующий шаг — ввести
      // числа, и лишнее нажатие «добавить товар» тут ничего не решает.
      if (!found.found) setForm(EMPTY_FORM);
      stop();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не получилось найти товар.");
    } finally {
      setBusy(false);
    }
  }, [request, stop]);

  const { supported } = useBarcodeScan({
    videoRef,
    // Пока показываем результат, в кадр не смотрим: иначе тот же код
    // прочитается снова и перебьёт открытую форму.
    active: result === null && !busy,
    onCode: (code) => { void handleCode(code); },
  });

  // Камеру включаем, как только выяснилось, что детектор есть: экран открыли
  // ради сканирования, и лишнее нажатие «включить камеру» тут ни к чему.
  useEffect(() => {
    if (supported === true && result === null) void start();
    return stop;
  }, [supported, result, start, stop]);

  async function saveNew() {
    if (!result || result.found) return;
    const name = form.name.trim();
    if (name.length < 2) { setError("Напишите, что это за продукт."); return; }

    const body = {
      code: result.code,
      name,
      portionG: num(form.portionG),
      kcalPer100: num(form.kcal),
      proteinPer100: num(form.protein),
      fatPer100: num(form.fat),
      carbsPer100: num(form.carbs),
      fiberPer100: num(form.fiber),
    };
    setBusy(true);
    setError(null);
    try {
      await request("", { method: "POST", body: JSON.stringify(body) });
      onItem({
        name,
        grams: body.portionG > 0 ? body.portionG : DEFAULT_PORTION_G,
        kcalPer100: body.kcalPer100,
        proteinPer100: body.proteinPer100,
        fatPer100: body.fatPer100,
        carbsPer100: body.carbsPer100,
        fiberPer100: body.fiberPer100,
        confidence: "high",
      });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не получилось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  function useFound() {
    if (!result?.found) return;
    onItem(itemFrom(result.product));
    // Подтверждение — фоновая мелочь: человеку от неё ничего не нужно, и
    // ждать ответа, чтобы закрыть экран, незачем.
    void request("", { method: "POST", body: JSON.stringify({ action: "confirm", code: result.product.code }) })
      .catch(() => {});
    onClose();
  }

  function scanAgain() {
    setResult(null);
    setError(null);
    setManualCode("");
    void start();
  }

  // --- найденный товар -------------------------------------------------
  if (result?.found) {
    const { product } = result;
    return <section className="scanner">
      <div className="scanner-head">
        <strong>Нашёлся</strong>
        <button className="scanner-close" type="button" aria-label="Закрыть" onClick={() => { stop(); onClose(); }}>×</button>
      </div>
      <p className="scanner-code">{result.pretty}</p>
      <p className="scanner-name">{product.name}</p>
      <p className="scanner-macros">
        {product.kcalPer100} ккал · Б {product.proteinPer100} · Ж {product.fatPer100} · У {product.carbsPer100} на 100 г
      </p>
      <p className="scanner-note">
        {product.confirmations > 0
          ? `Карточкой уже пользовались ${withPluralRu(product.confirmations, ["раз", "раза", "раз"])}.`
          : "Карточку завёл кто-то из пользователей — сверьте числа с упаковкой."}
      </p>
      <div className="scanner-actions">
        <button className="scanner-primary" type="button" onClick={useFound}>
          Добавить · {product.portionG > 0 ? product.portionG : DEFAULT_PORTION_G} г
        </button>
        <button className="scanner-secondary" type="button" onClick={scanAgain}>Сканировать ещё</button>
      </div>
    </section>;
  }

  // --- код есть, товара нет --------------------------------------------
  if (result) {
    return <section className="scanner">
      <div className="scanner-head">
        <strong>Такого товара у нас ещё нет</strong>
        <button className="scanner-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
      </div>
      <p className="scanner-code">{result.pretty}</p>
      {result.storeInternal
        ? <p className="scanner-note">
            Это внутренний код магазина: в нём зашиты вес и цена именно этой упаковки,
            и завтра он будет означать другой товар. Такой в общую базу не годится — добавьте продукт вручную.
          </p>
        : <p className="scanner-note">
            Введите числа с упаковки — и следующий, кто отсканирует эту пачку, получит их сразу.
            {result.region === "Россия" && " Код российский, так что пригодится многим."}
          </p>}

      {!result.storeInternal && <div className="scanner-form">
        <label>Название
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="как написано на упаковке" />
        </label>
        <div className="scanner-grid">
          {([
            ["portionG", "вес пачки, г"],
            ["kcal", "ккал / 100 г"],
            ["protein", "белки"],
            ["fat", "жиры"],
            ["carbs", "углеводы"],
            ["fiber", "клетчатка"],
          ] as Array<[keyof typeof form, string]>).map(([key, label]) => <label key={key}>
            {label}
            <input type="number" inputMode="decimal" min={0} step="0.1" value={form[key]}
              onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setError(null); }} />
          </label>)}
        </div>
      </div>}

      {error && <p className="scanner-error">{error}</p>}
      <div className="scanner-actions">
        {!result.storeInternal && <button className="scanner-primary" type="button" disabled={busy} onClick={() => void saveNew()}>
          {busy ? "Сохраняем…" : "Сохранить и добавить"}
        </button>}
        <button className="scanner-secondary" type="button" onClick={scanAgain}>Сканировать ещё</button>
      </div>
    </section>;
  }

  // --- сам сканер ------------------------------------------------------
  const manualValid = normalizeBarcode(manualCode) !== null;
  return <section className="scanner">
    <div className="scanner-head">
      <strong>Штрихкод</strong>
      <button className="scanner-close" type="button" aria-label="Закрыть" onClick={() => { stop(); onClose(); }}>×</button>
    </div>

    {supported === true && <>
      <div className="scanner-view" data-state={cameraState}>
        <video ref={videoRef} playsInline muted />
        {/* Рамка не декоративная: без неё человек подносит пачку целиком и
            держит код слишком далеко, чтобы детектор его разобрал. */}
        <span className="scanner-frame" aria-hidden="true" />
      </div>
      <p className="scanner-note">
        {cameraState === "denied" || cameraState === "unavailable"
          ? "Камера недоступна — введите цифры под полосками."
          : busy ? "Ищем товар…" : "Наведите на полоски. Код читается сам."}
      </p>
    </>}

    {supported === false && <p className="scanner-note">
      Этот браузер не читает штрихкоды. Введите цифры, напечатанные под полосками, — они есть на каждой упаковке.
    </p>}

    <div className="scanner-manual">
      <label>Или введите код
        <input inputMode="numeric" value={manualCode} placeholder="4600682003014"
          onChange={(e) => { setManualCode(e.target.value); setError(null); }} />
      </label>
      <button className="scanner-secondary" type="button" disabled={!manualValid || busy}
        onClick={() => void handleCode(normalizeBarcode(manualCode)!)}>
        Найти
      </button>
    </div>
    {/* Про неверную контрольную цифру говорим только при ручном вводе: на
        живом кадре она срабатывает постоянно, и мигать ошибкой во время
        наводки — значит мешать. */}
    {manualCode.trim().length >= 8 && !manualValid &&
      <p className="scanner-note">Проверьте цифры: похоже, одна не та — код не сходится с контрольной цифрой.</p>}

    {error && <p className="scanner-error">{error}</p>}
  </section>;
}

export { formatBarcode };

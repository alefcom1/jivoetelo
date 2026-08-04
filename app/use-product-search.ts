"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PORTION_G, type BarcodeProduct } from "@/lib/barcode";

/**
 * Поиск по базе товаров, заведённых людьми (таблица `barcodes`).
 *
 * ## Почему часть справочника осталась на клиенте, а часть уехала на сервер
 *
 * Справочник (lib/food-reference.ts) — курируемая основа рациона, три сотни
 * позиций. Он в бандле сознательно: поиск по нему мгновенный, без сети и без
 * ожидания, а весит он около шестнадцати килобайт в сжатом виде — меньше
 * одной фотографии.
 *
 * База штрихкодов растёт от людей и потолка не имеет вовсе — её в бандл не
 * положишь ни сейчас, ни тем более потом. Поэтому граница проходит здесь:
 * маленькое и постоянное — на клиенте, растущее — на сервере.
 *
 * Без этого поиска товар, заведённый по штрихкоду, находился бы только
 * повторным сканированием: набрать его название было негде.
 */

/** Пауза перед запросом: человек печатает быстрее, чем ходит сеть. */
const DEBOUNCE_MS = 300;

export type ProductHit = {
  /** Штрихкод. Наружу не показывается, но служит ключом списка. */
  code: string;
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  fiberPer100: number;
  confidence: string;
  /** Сколько раз карточкой пользовались — подпись «проверено людьми». */
  confirmations: number;
};

function toHit(product: BarcodeProduct): ProductHit {
  return {
    code: product.code,
    name: product.name,
    grams: product.portionG > 0 ? product.portionG : DEFAULT_PORTION_G,
    kcalPer100: product.kcalPer100,
    proteinPer100: product.proteinPer100,
    fatPer100: product.fatPer100,
    carbsPer100: product.carbsPer100,
    fiberPer100: product.fiberPer100,
    // Числа с упаковки, а не оценка модели по фотографии.
    confidence: "high",
    confirmations: product.confirmations,
  };
}

/** Названия сравниваем так же, как поиск по справочнику: без ё и регистра. */
function nameKey(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

/**
 * @param exclude Названия, уже показанные из справочника. Без этого один и
 * тот же «Кефир 1%» выходил двумя строками подряд — из бандла и из базы, — и
 * человек читал это как поломку, а не как два разных продукта.
 */
export function useProductSearch(
  query: string,
  endpoint: string,
  headers?: Record<string, string>,
  exclude: string[] = [],
): ProductHit[] {
  const [hits, setHits] = useState<ProductHit[]>([]);
  // Заголовки — новый объект на каждый рендер родителя; в зависимостях
  // эффекта они запускали бы запрос на каждую букву дважды.
  const headersRef = useRef(headers);
  const excludeRef = useRef(exclude);
  useEffect(() => {
    headersRef.current = headers;
    excludeRef.current = exclude;
  });

  useEffect(() => {
    const needle = query.trim();
    let cancelled = false;

    // Короткий запрос гасит список, но через тот же таймер, а не сразу:
    // синхронный setState в теле эффекта запрещён правилом
    // react-hooks/set-state-in-effect, и это тот же приём, что в
    // app/tg/telegram.ts (useInsideTelegram).
    if (needle.length < 2) {
      const clear = setTimeout(() => setHits([]), 0);
      return () => clearTimeout(clear);
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(needle)}`, {
          headers: headersRef.current,
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { items?: BarcodeProduct[] };
        // Молчаливый отказ здесь уместен: это дополнение к мгновенному
        // поиску по справочнику, а не единственный его источник. Ошибка
        // сети не должна закрывать собой список, который уже показан.
        const skip = new Set(excludeRef.current.map(nameKey));
        if (!cancelled) setHits((payload.items ?? []).map(toHit).filter((hit) => !skip.has(nameKey(hit.name))));
      } catch {
        // см. выше
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, endpoint]);

  return hits;
}

/**
 * Позиция для дневника из подсказки: без кода и счётчика подтверждений — они
 * нужны только списку и в запись не идут.
 */
export function productToItem(hit: ProductHit) {
  return {
    name: hit.name,
    grams: hit.grams,
    kcalPer100: hit.kcalPer100,
    proteinPer100: hit.proteinPer100,
    fatPer100: hit.fatPer100,
    carbsPer100: hit.carbsPer100,
    fiberPer100: hit.fiberPer100,
    confidence: hit.confidence,
  };
}

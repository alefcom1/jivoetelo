/**
 * Общая начинка точек приёма штрихкодов для веба и Mini App.
 *
 * Два обработчика различаются ровно одним — как узнают пользователя (сессия
 * против подписи Telegram). Всё остальное у них обязано совпадать: карточка
 * товара общая, и правила её заведения не могут зависеть от того, из какого
 * клиента человек держит ту же самую пачку.
 */

import { barcodeRegion, formatBarcode, isStoreInternal, normalizeBarcode } from "./barcode.ts";
import { findByBarcode, saveBarcode, searchBarcodesByName, type BarcodeProduct } from "./barcode-store.ts";

export type LookupResponse =
  | { found: true; product: BarcodeProduct; pretty: string }
  | { found: false; code: string; pretty: string; region: string | null; storeInternal: boolean };

/** Тексты отказов — одной таблицей на оба клиента. */
export const BARCODE_ERRORS = {
  invalid_code:
    "Код не распознан. Бывает от блика на плёнке или мятой упаковки — попробуйте ещё раз или введите цифры под полосками руками.",
  store_internal:
    "Это внутренний код магазина: в нём зашиты вес и цена именно этой упаковки, и завтра он будет означать другой товар. Добавьте продукт вручную.",
  no_name: "Напишите, что это за продукт — хотя бы пару слов с упаковки.",
  blank_nutrition:
    "Нужны числа с упаковки: без них карточка бесполезна — следующий, кто отсканирует эту пачку, получит ноль калорий.",
} as const;

/** Разбирает код из запроса и ищет товар. */
export async function lookupBarcode(rawCode: string): Promise<LookupResponse | null> {
  const code = normalizeBarcode(rawCode);
  if (!code) return null;

  const product = await findByBarcode(code);
  if (product) return { found: true, product, pretty: formatBarcode(code) };

  // Не нашлось — говорим не только «нет», но и что это за код. Человек
  // заполняет базу охотнее, когда понимает, что заполняет: у российской
  // пачки товар появится, как только кто-нибудь его заведёт, у импортной
  // банки — скорее всего нет.
  return {
    found: false,
    code,
    pretty: formatBarcode(code),
    region: barcodeRegion(code),
    storeInternal: isStoreInternal(code),
  };
}

export type SaveBody = {
  code?: unknown;
  name?: unknown;
  kcalPer100?: unknown;
  proteinPer100?: unknown;
  fatPer100?: unknown;
  carbsPer100?: unknown;
  fiberPer100?: unknown;
  portionG?: unknown;
};

/**
 * Заводит карточку по телу запроса. Числа приходят от клиента и потому
 * недоверенные — потолки накладывает saveBarcode (общая таблица PER_100_CAPS
 * из lib/nutrition.ts).
 */
export async function saveBarcodeFromBody(body: SaveBody, userId: number) {
  return await saveBarcode({
    code: String(body.code ?? ""),
    name: String(body.name ?? ""),
    kcalPer100: Number(body.kcalPer100 ?? 0),
    proteinPer100: Number(body.proteinPer100 ?? 0),
    fatPer100: Number(body.fatPer100 ?? 0),
    carbsPer100: Number(body.carbsPer100 ?? 0),
    fiberPer100: Number(body.fiberPer100 ?? 0),
    portionG: Number(body.portionG ?? 0),
    userId,
  });
}

/**
 * Поиск по названию — та же точка приёма, другой параметр.
 *
 * Отдельного адреса не заводим: и там и там речь об одном справочнике
 * товаров, и два адреса с одинаковой авторизацией и одинаковыми правилами
 * разошлись бы при первой же правке.
 */
export async function searchBarcodes(query: string): Promise<{ items: BarcodeProduct[] }> {
  return { items: await searchBarcodesByName(query) };
}

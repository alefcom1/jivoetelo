import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SPECIALIST_PRICE_RUB } from "../lib/pro/pricing.ts";
import { TARIFFS, tariffByKey } from "../lib/paid.ts";

/**
 * Модель раздела для специалистов: кабинет бесплатен, платит клиент.
 *
 * Обещание напечатано на `/pro` крупно и вынесено в заголовок раздела о
 * цене. Сломать его можно одной строкой в проходе к данным — и снаружи это
 * будет выглядеть не как введение платы, а как обычный отказ в доступе:
 * «кабинет не открывается». Поэтому проверки ниже смотрят не на поведение, а
 * на исходный текст модулей периметра.
 */

const PERIMETER = ["../lib/pro/guard.ts", "../lib/pro/access.ts"];

/** Всё, чем в этом коде можно выразить «сначала заплати». */
const PAYWALL = [
  "plan",
  "accessUntil",
  "access_until",
  "hasPaidAccess",
  "effectivePlan",
  "PLAN_LIMITS",
  "premium",
  "TARIFFS",
  "priceRub",
];

test("кабинет специалиста ничего не стоит", () => {
  assert.equal(SPECIALIST_PRICE_RUB, 0, "цена кабинета — обещание на /pro, а не переменная");
});

test("проход к данным клиента не знает про оплату", async () => {
  // Кабинет показывает то, что уже посчитано и уже оплачено в дневнике
  // клиента. Появление здесь тарифа означало бы плату за просмотр чужой
  // оплаченной работы — и молча отменило бы то, что написано на странице.
  for (const path of PERIMETER) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    // Комментарии выкидываем: в них слова про тариф законны и нужны — там как
    // раз объясняется, почему оплаты здесь нет.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const word of PAYWALL) {
      assert.ok(
        !code.includes(word),
        `${path}: в коде появилось «${word}» — кабинет обещан бесплатным, а доступ начал зависеть от оплаты`,
      );
    }
  }
});

test("клиент специалиста платит по общему тарифу, без отдельной цены", () => {
  // Отдельная цена «по рекомендации специалиста» — это способ сделать так,
  // чтобы два человека за одно и то же платили разное, и первый же из них,
  // сравнив, перестанет верить обеим ценам.
  const keys = TARIFFS.map((tariff) => tariff.key).sort();
  assert.deepEqual(keys, ["month", "year"], `появился отдельный тариф: ${keys.join(", ")}`);
  assert.equal(tariffByKey("month").priceRub, 190, "цена на /pro названа числом и берётся отсюда");
});

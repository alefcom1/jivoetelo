import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DISHES, DISHES_UPDATED_AT, dishUpdatedAt } from "../lib/dishes.ts";
import { PRODUCTS, PRODUCTS_UPDATED_AT, productUpdatedAt } from "../lib/products.ts";
import { GLOSSARY, GLOSSARY_UPDATED_AT, glossaryUpdatedAt } from "../lib/glossary.ts";
import { LEGAL_UPDATED_AT } from "../lib/legal.ts";

/**
 * Даты в карте сайта.
 *
 * Поле `lastmod` — единственное, чем мы сообщаем поисковику, что страница
 * действительно изменилась. Оно же — вход для IndexNow: заявка собирается из
 * разницы двух карт (`lib/indexnow.ts`), и дата, двигающаяся без причины,
 * превращает уведомление в шум ровно в тот момент, когда оно нужнее всего.
 *
 * Ломается это тихо. Пока сюда подставлялась одна общая дата, правка оферты
 * «обновляла» шестьдесят пять адресов из восьмидесяти шести — сотню страниц
 * борща, гречки и калькуляторов, где не поменялось ни слова. На сайте это не
 * видно никак, поэтому проверку держит тест.
 */

const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");

test("дату оферты получают только страницы /legal", () => {
  const misuse = source
    .split("\n")
    .map((line) => line.trim())
    // Комментарии не в счёт: причина, по которой даты разведены, объяснена
    // прямо в файле и упоминает константу по имени.
    .filter((line) => !/^(\/\/|\/?\*)/.test(line))
    .filter((line) => line.includes("LEGAL_UPDATED_AT"))
    .filter((line) => !line.includes("/legal") && !line.startsWith("import"));
  assert.deepEqual(misuse, [], "LEGAL_UPDATED_AT утёк на страницу, которая не является документом");
});

test("у каталогов свои даты, не дата оферты", () => {
  for (const [name, value] of [
    ["DISHES_UPDATED_AT", DISHES_UPDATED_AT],
    ["PRODUCTS_UPDATED_AT", PRODUCTS_UPDATED_AT],
    ["GLOSSARY_UPDATED_AT", GLOSSARY_UPDATED_AT],
  ]) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${name} не похожа на дату`);
    assert.ok(!Number.isNaN(new Date(value).getTime()), `${name} не разбирается как дата`);
  }
  // Совпадение с датой оферты допустимо случайно, но не как способ её взять:
  // это ловит `misuse` выше. Здесь важно, что константы вообще существуют
  // отдельно — иначе разделить даты нечем.
  assert.ok(LEGAL_UPDATED_AT.length === 10);
});

test("собственная дата позиции перекрывает общую", () => {
  assert.equal(
    dishUpdatedAt({ updatedAt: "2026-08-05" }).toISOString().slice(0, 10),
    "2026-08-05",
  );
  assert.equal(
    dishUpdatedAt({}).toISOString().slice(0, 10),
    DISHES_UPDATED_AT,
  );
  assert.equal(productUpdatedAt({}).toISOString().slice(0, 10), PRODUCTS_UPDATED_AT);
  assert.equal(glossaryUpdatedAt({}).toISOString().slice(0, 10), GLOSSARY_UPDATED_AT);
});

test("ни одна дата не уехала в будущее", () => {
  // Дата правки позже сегодняшней — либо опечатка в году, либо копия из
  // черновика. Поисковик такую строку игнорирует целиком, и страница остаётся
  // вовсе без `lastmod`, чего по карте сайта не видно.
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  for (const dish of DISHES) {
    assert.ok(dishUpdatedAt(dish) < tomorrow, `${dish.slug}: дата правки в будущем`);
  }
  for (const product of PRODUCTS) {
    assert.ok(productUpdatedAt(product) < tomorrow, `${product.slug}: дата правки в будущем`);
  }
  for (const term of GLOSSARY) {
    assert.ok(glossaryUpdatedAt(term) < tomorrow, `${term.slug}: дата правки в будущем`);
  }
});

test("даты позиций разбираются, а не молча дают Invalid Date", () => {
  // `new Date("2026-8-5")` в узлах разбирается, а в браузере — нет; строка
  // вида «5 августа» не разбирается нигде и даёт NaN, который в XML уходит
  // пустым значением. Форма даты у позиции должна быть ровно ГГГГ-ММ-ДД.
  const dated = [...DISHES, ...PRODUCTS, ...GLOSSARY].filter((item) => item.updatedAt);
  for (const item of dated) {
    assert.match(item.updatedAt, /^\d{4}-\d{2}-\d{2}$/, `${item.slug}: дата не в формате ГГГГ-ММ-ДД`);
  }
});

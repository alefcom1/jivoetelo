#!/usr/bin/env node
// Разведка Open Food Facts: доходит ли до него сервер и что он вообще знает
// о товарах с наших полок.
//
// Зачем отдельный скрипт. Решение «делать штрихкоды или нет» упирается в
// один вопрос, на который нельзя ответить из головы: какая доля реальных
// российских товаров находится в базе с пригодными числами. Оценка в
// docs/market-research.md — 15–25 тысяч товаров по РФ — это порядок
// величины, а не ответ. Ответ даёт замер на своих же штрихкодах.
//
// Как пользоваться (запускать на VPS — из среды разработки OFF закрыт
// политикой egress):
//
//   node scripts/off-probe.mjs 4600494000164 4680019621234 ...
//   node scripts/off-probe.mjs < barcodes.txt      # по одному в строке
//
// Возьмите два-три десятка штрихкодов с того, что реально едите: молочка,
// хлеб, крупы, снеки, вода. Смесь известных брендов и собственных марок
// сетей — на вторых база проваливается чаще всего.
//
// Скрипт ничего не пишет в базу и не меняет проект: это замер, а не фича.

import { readFileSync } from "node:fs";

const API = "https://world.openfoodfacts.org/api/v2/product";
// OFF просит представляться и держать не больше 100 запросов в минуту.
const USER_AGENT = "jivoetelo-probe/1.0 (https://jivoetelo.ru)";
const DELAY_MS = 700;

/** Поля, без которых находка бесполезна: дневник считает по ним. */
const REQUIRED = [
  ["energy-kcal_100g", "ккал"],
  ["proteins_100g", "белки"],
  ["fat_100g", "жиры"],
  ["carbohydrates_100g", "углеводы"],
];

function readBarcodes() {
  const fromArgs = process.argv.slice(2).filter((a) => /^\d{8,14}$/.test(a));
  if (fromArgs.length > 0) return fromArgs;
  // Иначе читаем stdin: удобно скормить файл со списком.
  const stdin = readFileSync(0, "utf8");
  return stdin.split(/\s+/).filter((a) => /^\d{8,14}$/.test(a));
}

async function probe(code) {
  const url = `${API}/${code}.json?fields=code,product_name,brands,countries_tags,nutriments`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (response.status === 404) return { code, found: false };
  if (!response.ok) return { code, error: `HTTP ${response.status}` };

  const body = await response.json();
  if (body.status !== 1 || !body.product) return { code, found: false };

  const nutriments = body.product.nutriments ?? {};
  const missing = REQUIRED.filter(([key]) => typeof nutriments[key] !== "number").map(([, label]) => label);
  return {
    code,
    found: true,
    name: body.product.product_name || "(без названия)",
    brand: body.product.brands || "",
    russian: (body.product.countries_tags ?? []).some((t) => /russia|россия/i.test(t)),
    kcal: nutriments["energy-kcal_100g"],
    missing,
  };
}

const barcodes = readBarcodes();
if (barcodes.length === 0) {
  console.error("Дайте штрихкоды аргументами или на stdin, по одному в строке.");
  process.exit(1);
}

console.log(`Проверяю ${barcodes.length} штрихкодов через ${API}\n`);

const results = [];
for (const code of barcodes) {
  try {
    const result = await probe(code);
    results.push(result);
    if (result.error) console.log(`  ${code}  ошибка: ${result.error}`);
    else if (!result.found) console.log(`  ${code}  нет в базе`);
    else {
      const gaps = result.missing.length > 0 ? `  БЕЗ: ${result.missing.join(", ")}` : "";
      console.log(`  ${code}  ${result.name}${result.brand ? ` · ${result.brand}` : ""} · ${result.kcal ?? "?"} ккал${gaps}`);
    }
  } catch (error) {
    results.push({ code, error: String(error.message ?? error) });
    console.log(`  ${code}  не достучались: ${error.message ?? error}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

const errors = results.filter((r) => r.error);
const found = results.filter((r) => r.found);
const usable = found.filter((r) => r.missing.length === 0);

console.log("\n— Итог —");
if (errors.length === results.length) {
  console.log("Ни один запрос не прошёл. Скорее всего, сервер не ходит на OFF —");
  console.log("это и есть ответ: без прокси штрихкоды не заработают.");
  process.exit(2);
}
if (errors.length > 0) console.log(`Ошибок сети: ${errors.length} из ${results.length}`);
console.log(`Найдено в базе:      ${found.length} из ${results.length} (${Math.round((found.length / results.length) * 100)}%)`);
console.log(`Из них с полными КБЖУ: ${usable.length} (${Math.round((usable.length / results.length) * 100)}% от всех)`);
console.log(`Помечены как российские: ${found.filter((r) => r.russian).length}`);
console.log(`
Как читать. Доля с полными КБЖУ — это и есть доля сканирований, которые
закончатся ответом, а не «не нашли, разберите фотографией». Ниже половины
сканер обещать нечего: он будет чаще отправлять к обычному разбору, чем
отвечать сам, и люди перестанут им пользоваться.`);

#!/usr/bin/env node
/**
 * Уведомление поисковиков об изменениях при выкатке (IndexNow).
 *
 * Устройство и модель угроз — в `lib/indexnow.ts`. Здесь только механика.
 *
 * Работает в два захода вокруг выкатки, из GitHub Actions:
 *
 *   node scripts/indexnow.mjs snapshot before.json   # до выкатки
 *   ...выкатка...
 *   node scripts/indexnow.mjs submit before.json     # после выкатки
 *
 * Почему две карты сайта, а не разбор git-истории. Карта сайта уже знает всё
 * нужное — какие адреса существуют и когда правилось их содержимое, — и знает
 * это ровно так, как видит поисковик. Разбирать же diff исходников значило бы
 * восстанавливать связь «файл → адрес» вторым, независимым от `app/sitemap.ts`
 * способом; такие два способа расходятся молча.
 *
 * Ни один сбой здесь не роняет выкатку. Уведомление — ускорение обхода, а не
 * условие работы сайта: сорвалось — робот придёт сам, как приходил раньше.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  INDEXNOW_ENDPOINTS,
  MAX_URLS,
  changedUrls,
  indexNowPayload,
} from "../lib/indexnow.ts";

const SITE = (process.env.SITE_URL ?? "https://jivoetelo.ru").replace(/\/+$/, "");

/**
 * Разбор карты сайта регулярным выражением, а не XML-парсером.
 *
 * Документ мы генерируем сами (`app/sitemap.ts` через Next), его структура
 * известна и плоская; тащить зависимость ради двух тегов незачем. Адрес без
 * `<lastmod>` — законный случай, дата тогда пустая строка, и такой адрес
 * попадёт в заявку только когда он новый.
 */
function parseSitemap(xml) {
  const entries = [];
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const url = block.match(/<loc>(.*?)<\/loc>/)?.[1];
    if (!url) continue;
    entries.push({ url, lastModified: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? "" });
  }
  return entries;
}

async function fetchSitemap() {
  const response = await fetch(`${SITE}/sitemap.xml`, { headers: { "user-agent": "jivoetelo-indexnow" } });
  if (!response.ok) throw new Error(`sitemap.xml вернул ${response.status}`);
  return parseSitemap(await response.text());
}

async function snapshot(file) {
  const entries = await fetchSitemap();
  writeFileSync(file, JSON.stringify(entries));
  console.log(`Снимок карты сайта до выкатки: ${entries.length} адресов → ${file}`);
}

async function submit(file) {
  let before;
  try {
    before = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // Снимка нет — значит до выкатки сайт не ответил (первая выкатка, авария).
    // Отправить всё подряд было бы худшим из выходов: заявка на весь каталог
    // и есть тот шум, от которого сигнал перестают учитывать.
    console.log("Снимка до выкатки нет — уведомление пропущено.");
    return;
  }

  const after = await fetchSitemap();
  const changed = changedUrls(before, after);
  if (changed.length === 0) {
    console.log("Публичные страницы не изменились — уведомлять не о чем.");
    return;
  }

  // Хост берём из самих адресов, а не из SITE_URL. Заявку, где `host` не
  // совпадает с адресами списка, протокол отклоняет целиком (422), и это ровно
  // то расхождение, которое возникло бы при снятии карты с одного адреса
  // (например, локальной сборки) при абсолютных ссылках на боевой домен.
  const host = new URL(changed[0]).host;
  const ours = changed.filter((url) => new URL(url).host === host);
  if (ours.length < changed.length) {
    console.log(`Пропущено ${changed.length - ours.length} адресов с другого хоста.`);
  }

  const urls = ours.slice(0, MAX_URLS);
  if (ours.length > urls.length) {
    console.log(
      `Изменилось ${ours.length} адресов — это похоже на общую правку, а не на новые страницы. ` +
        `Отправляем первые ${urls.length}, остальные ${ours.length - urls.length} робот обойдёт сам.`,
    );
  }

  const payload = indexNowPayload(host, urls);
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      // 200 — приняли, 202 — приняли и проверяют ключ. Оба означают успех.
      const verdict = response.ok ? "принято" : `отказ ${response.status}`;
      console.log(`${endpoint}: ${verdict} (${urls.length} адресов)`);
    } catch (error) {
      console.log(`${endpoint}: не достучались — ${error.message}`);
    }
  }

  for (const url of urls) console.log(`  → ${url}`);
}

const [command, file] = process.argv.slice(2);
if (!file || (command !== "snapshot" && command !== "submit")) {
  console.error("Использование: indexnow.mjs snapshot|submit <файл>");
  process.exit(2);
}

try {
  await (command === "snapshot" ? snapshot(file) : submit(file));
} catch (error) {
  // Сознательно нулевой код возврата: см. шапку — выкатку это не роняет.
  console.log(`IndexNow: ${error.message}`);
}

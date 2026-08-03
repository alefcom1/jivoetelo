/**
 * Снимок читателя: отправка, модерация, публикация, отзыв.
 *
 * Проверяется не «работает ли форма», а четыре свойства, из-за которых этот
 * поток вообще устроен так сложно:
 *
 * 1. Без галочки согласия отправить нельзя — кнопка выключена.
 * 2. До решения модератора снимка нет ни на странице, ни по прямой ссылке.
 * 3. Очередь модерации не открывается постороннему (404, а не «нет прав»).
 * 4. Отзыв согласия убирает уже опубликованный снимок — и со страницы, и с
 *    маршрута раздачи.
 *
 * Ключ снимка в фикстуре обязан быть настоящей формы `<userId>/<uuid>.<ext>`:
 * `photoBelongsTo` проверяет её, и произвольное имя файла отвергается — это
 * не придирка теста, а первое, обо что споткнулась живая проверка.
 *
 * Запуск:
 *   UPLOADS_DIR=<тот же> ADMIN_EMAILS=moder@test.local … node .next/standalone/server.js
 *   UPLOADS_DIR=<тот же> ADMIN_EMAILS=moder@test.local node tests/e2e/catalog-photos.mjs
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { launchBrowser } from "./browser.mjs";

// Однопиксельный валидный JPEG: сценарий не должен зависеть от файлов,
// оставшихся от чужих прогонов, — фикстуру он приносит с собой.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64");

const BASE = "http://127.0.0.1:3111";
const UPLOADS = process.env.UPLOADS_DIR;
if (!UPLOADS) throw new Error("Нужен UPLOADS_DIR — тот же, с которым запущен сервер");
if (!process.env.ADMIN_EMAILS?.includes("moder@test.local")) {
  throw new Error("Нужен ADMIN_EMAILS=moder@test.local — иначе очередь модерации недоступна");
}
const step = (n) => console.log(`--- ${n}`);
const sql = (q) => execSync(
  `PGPASSWORD=jivoetelo psql -h 127.0.0.1 -p 55432 -U jivoetelo -d jivoetelo -At -c "${q.replaceAll('"','\\"')}"`,
  { encoding: "utf8", shell: "/bin/bash" })
  // psql печатает после строки результата ещё и тег команды (INSERT 0 1) —
  // берём первую строку, как это делает tests/e2e/inbox.mjs.
  .trim().split("\n")[0].trim();

const user = `sharer-${Date.now()}@example.com`;
const moder = "moder@test.local";
const MODER_PASSWORD = "correct-horse-42";
const browser = await launchBrowser();
try {
  step("1. Регистрация автора");
  const page = await browser.newPage();
  page.on("dialog", d => d.accept());
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', user);
  await page.fill('input[name="password"]', "correct-horse-42");
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
  // План для этого потока не нужен: делимся снимком, а не считаем норму.

  step("2. Записываем приём пищи со снимком (через БД + файл)");
  const uid = sql(`SELECT id FROM users WHERE email = '${user}'`);
  const key = `${uid}/0f8e1c2a-4b5d-6e7f-8a9b-0c1d2e3f4a5b.jpg`;
  mkdirSync(`${UPLOADS}/${uid}`, { recursive: true });
  writeFileSync(`${UPLOADS}/${key}`, TINY_JPEG);
  const mealId = sql(`INSERT INTO meals (user_id, eaten_on, eaten_time, meal_type, photo_key) VALUES (${uid}, CURRENT_DATE, '13:00', 'lunch', '${key}') RETURNING id`);
  sql(`INSERT INTO meal_items (meal_id, name, grams, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, fiber_per_100, confidence) VALUES (${mealId}, 'Гречка отварная', 180, 110, 4.2, 1.1, 21.3, 2.7, 'high')`);

  step("3. Блок «поделиться» виден на странице записи");
  await page.goto(`${BASE}/app/meals/${mealId}`);
  await page.waitForSelector('button:has-text("Поделиться снимком в каталоге")', { timeout: 20000 });
  await page.click('button:has-text("Поделиться снимком в каталоге")');
  await page.waitForSelector(".share-photo");

  step("4. Кнопка отправки заблокирована, пока нет согласия");
  const disabled = await page.isDisabled('.share-photo button[type="submit"]');
  if (!disabled) throw new Error("Можно отправить без согласия — это и есть то, чего быть не должно");

  step("5. Ставим согласие и отправляем");
  await page.check('.share-photo input[name="consent"]');
  await page.click('.share-photo button[type="submit"]');
  await page.waitForSelector(".share-photo-done", { timeout: 20000 });

  const row = sql(`SELECT status || '|' || caption || '|' || consent_version FROM catalog_photos WHERE user_id = ${uid}`);
  console.log(`    в базе: ${row}`);
  if (!row.startsWith("pending|")) throw new Error("Снимок не встал в очередь модерации");
  if (!row.includes("Гречка отварная, порция 180 г")) throw new Error(`Подпись не та: ${row}`);
  const consent = sql(`SELECT count(*) FROM user_consents WHERE user_id = ${uid} AND kind = 'photo_publication' AND withdrawn_at IS NULL`);
  if (consent !== "1") throw new Error("Согласие не зафиксировано вместе с отправкой");

  step("6. До модерации снимка на публичной странице нет");
  const photoId = sql(`SELECT id FROM catalog_photos WHERE user_id = ${uid}`);
  const pub = await fetch(`${BASE}/api/produkty/photo/${photoId}`);
  if (pub.status !== 404) throw new Error(`Непроверенный снимок отдаётся: ${pub.status}`);

  step("7. Очередь модерации закрыта для постороннего");
  const outsider = await page.goto(`${BASE}/admin/photos`);
  if (outsider.status() !== 404) throw new Error(`Чужой попал в админку: ${outsider.status()}`);

  step("8. Модератор видит очередь и сам кадр");
  const modPage = await browser.newPage();
  modPage.on("dialog", d => d.accept());
  // Модератор — фиксированная почта из ADMIN_EMAILS, поэтому при повторном
  // прогоне аккаунт уже существует: регистрируем, а если занято — входим.
  await modPage.goto(`${BASE}/register`);
  await modPage.fill('input[name="email"]', moder);
  await modPage.fill('input[name="password"]', MODER_PASSWORD);
  await modPage.check('input[name="consent_terms"]');
  await modPage.check('input[name="consent_ai"]');
  await modPage.click('button[type="submit"]');
  await modPage.waitForURL(/\/app($|\?)/, { timeout: 20000 }).catch(async () => {
    await modPage.goto(`${BASE}/login`);
    await modPage.fill('input[name="email"]', moder);
    await modPage.fill('input[name="password"]', MODER_PASSWORD);
    await modPage.click('button[type="submit"]');
    await modPage.waitForURL(/\/app($|\?)/, { timeout: 20000 });
  });
  await modPage.goto(`${BASE}/admin/photos`);
  await modPage.waitForSelector(".admin-photo-queue li", { timeout: 20000 });
  const card = `.admin-photo-queue li:has(input[value="${photoId}"])`;
  await modPage.waitForSelector(card, { timeout: 20000 });
  const text = await modPage.textContent(card);
  if (!text.includes(user)) throw new Error("Модератор не видит, кто прислал");
  if (!text.includes("действует")) throw new Error("Не показано состояние согласия");
  const imgStatus = await modPage.evaluate(async (sel) =>
    (await fetch(document.querySelector(`${sel} img`).src)).status, card);
  if (imgStatus !== 200) throw new Error(`Модератор не видит кадр: ${imgStatus}`);

  step("9. Публикуем — снимок появляется на странице продукта");
  // Целимся в свою карточку, а не в первую попавшуюся: в очереди могут
  // лежать снимки от прошлых прогонов, и «очередь опустела» — не тот
  // признак, по которому судить об успехе.
  await modPage.click(`.admin-photo-queue li:has(input[value="${photoId}"]) button:has-text("Опубликовать")`);
  await modPage.waitForSelector(`.admin-photo-queue li:has(input[value="${photoId}"])`, {
    state: "detached",
    timeout: 20000,
  });
  const after = await fetch(`${BASE}/api/produkty/photo/${photoId}`);
  if (after.status !== 200) throw new Error(`После публикации снимок не отдаётся: ${after.status}`);
  const html = await (await fetch(`${BASE}/produkty/grechka`)).text();
  if (!html.includes(`/api/produkty/photo/${photoId}`)) throw new Error("Снимка нет на странице продукта");
  if (!html.includes('alt="Гречка отварная, порция 180 г"')) throw new Error("Подписи нет в alt");

  step("10. Отзыв согласия убирает снимок с публичной страницы");
  await page.goto(`${BASE}/app/settings`);
  await page.click('button:has-text("Отозвать согласие на публикацию")');
  await page.waitForTimeout(1500);
  const revoked = await fetch(`${BASE}/api/produkty/photo/${photoId}`);
  if (revoked.status !== 404) throw new Error(`После отзыва снимок всё ещё отдаётся: ${revoked.status}`);
  const html2 = await (await fetch(`${BASE}/produkty/grechka`)).text();
  if (html2.includes(`/api/produkty/photo/${photoId}`)) throw new Error("Снимок остался на странице после отзыва");

  console.log("ПОТОК ЦЕЛИКОМ OK");
} finally { await browser.close(); }

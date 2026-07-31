/**
 * Проверяет съёмку камерой в веб-версии: поддельное устройство Chromium даёт
 * настоящий поток, так что путь «нажал → снял → получил файл» проверяется
 * целиком, а не по кусочкам.
 */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

// Браузер здесь запускается не через ./browser.mjs: нужен поддельный
// видеопоток, а он включается только флагами запуска. Настоящей камеры в
// сборочной среде нет, и без подделки проверить было бы нечего.
const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3164";
const email = `cam-${Date.now()}@example.com`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["camera"] });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`ошибка страницы: ${e.message}`));

await page.goto(`${BASE}/register`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "correct-horse-42");
await page.check('input[name="consent_terms"]');
await page.check('input[name="consent_ai"]');
await page.click('button[type="submit"]');
await page.waitForURL("**/app", { timeout: 20000 });
console.log("1. зарегистрировались");

await page.goto(`${BASE}/app/add`);
await page.click('button[role="tab"]:has-text("Фото")');
await page.waitForSelector(".camera-open");
console.log("2. кнопка «Снять камерой» есть");

await page.click(".camera-open");
await page.waitForSelector(".camera-live video", { timeout: 15000 });
await page.waitForFunction(() => {
  const v = document.querySelector(".camera-live video");
  return v && v.videoWidth > 0;
}, { timeout: 15000 });
const size = await page.evaluate(() => {
  const v = document.querySelector(".camera-live video");
  return [v.videoWidth, v.videoHeight];
});
console.log(`3. поток пошёл: ${size.join("×")}`);

await page.click('button:has-text("Снять кадр")');
await page.waitForSelector('.addflow-photo img[alt="Предпросмотр фото еды"]', { timeout: 10000 });
console.log("4. кадр снят, предпросмотр появился");

// Камера должна погаснуть сразу после снимка, а не висеть до ухода со страницы.
const live = await page.evaluate(() => document.querySelectorAll(".camera-live").length);
if (live !== 0) problems.push("режим съёмки не закрылся после кадра");

await page.click('button:has-text("Разобрать")');
await page.waitForSelector(".addflow-actions button:has-text('Сохранить')", { timeout: 30000 });
console.log("5. снимок ушёл на разбор и вернулся черновиком");

await page.click("button:has-text('Сохранить')");
await page.waitForURL("**/app**", { timeout: 20000 });
console.log("6. приём пищи сохранён");

if (problems.length) { console.log("ПРОБЛЕМЫ:\n" + problems.join("\n")); process.exitCode = 1; }
else console.log("— всё прошло —");
await browser.close();

/**
 * Вкладка «Камера» в Mini App: видоискатель, спуск затвора, повтор записанного.
 *
 * Поддельное устройство Chromium даёт настоящий поток, поэтому путь «открыл
 * вкладку → увидел кадр → снял → получил черновик» проверяется целиком.
 * Именно этого пути раньше не было вовсе: экран назывался «Камера», а
 * открывался на текстовом поле.
 *
 * Запуск: сервер на 3111 (AI_PROVIDER=mock), Postgres с миграциями.
 *   node tests/e2e/tg-camera.mjs
 */

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3111";
const PSQL = [
  "-h", process.env.PGHOST ?? "127.0.0.1",
  "-p", process.env.PGPORT ?? "55432",
  "-U", process.env.PGUSER ?? "jivoetelo",
  "-d", process.env.PGDATABASE ?? "jivoetelo",
  "-t", "-A",
];
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";
const TG_USER_ID = 740000 + (Date.now() % 50000);

const sql = (query) => execFileSync("psql", [...PSQL, "-c", query], { encoding: "utf8" }).trim();
const one = (query) => sql(query).split("\n")[0].trim();

/** Подписываем initData так же, как это делает Telegram. */
function signInitData(userId) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-camera",
    user: JSON.stringify({ id: userId, first_name: "Марина" }),
  };
  const pairs = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(pairs.map(([k, v]) => `${k}=${v}`).join("\n")).digest("hex");
  const search = new URLSearchParams(params);
  search.set("hash", hash);
  return search.toString();
}

const stamp = Date.now();
const userId = Number(one(
  `INSERT INTO users (email, password_hash, telegram_user_id)
   VALUES ('e2e-tgcam-${stamp}@example.com', 'x', '${TG_USER_ID}') RETURNING id`,
));

/** Один разовый ужин: он и должен оказаться в «Повторить». */
const day = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
const mealId = one(
  `INSERT INTO meals (user_id, eaten_on, eaten_time, meal_type, source_text)
   VALUES (${userId}, '${day}', '19:10', 'dinner', 'Плов') RETURNING id`,
);
sql(`INSERT INTO meal_items (meal_id, name, grams, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, fiber_per_100, confidence)
     VALUES (${mealId}, 'Плов с бараниной', 300, 190, 9, 8, 20, 1.2, 'high')`);

// Браузер запускается не через ./browser.mjs: нужен поддельный видеопоток, а
// он включается только флагами запуска. Настоящей камеры в среде нет.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const problems = [];
try {
  const context = await browser.newContext({
    viewport: { width: 420, height: 860 },
    permissions: ["camera"],
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`ошибка страницы: ${e.message}`));
  await page.addInitScript(`
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(signInitData(TG_USER_ID))},
      initDataUnsafe: { user: { first_name: "Марина" } },
      colorScheme: "light",
      themeParams: { bg_color: "#ffffff", secondary_bg_color: "#f4f1ea", text_color: "#171917",
        hint_color: "#75766f", link_color: "#2946c6", button_color: "#171917", button_text_color: "#ffffff" },
      MainButton: { text: "", show(){}, hide(){}, setText(){}, showProgress(){}, hideProgress(){},
        enable(){}, disable(){}, onClick(){}, offClick(){}, setParams(){} },
      BackButton: { show(){}, hide(){}, onClick(){}, offClick(){} },
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
      ready(){}, expand(){}, onEvent(){}, offEvent(){},
    } };
  `);

  console.log("1. Открываем Mini App и переходим на «Камеру»");
  await page.goto(`${BASE}/tg`);
  await page.waitForSelector(".tg-app", { timeout: 20000 });
  await page.click('.tg-tabs button:has-text("Камера")');

  console.log("2. Видоискатель включается сам, без единого нажатия");
  await page.waitForSelector(".tg-viewfinder video", { timeout: 15000 });
  await page.waitForFunction(() => {
    const video = document.querySelector(".tg-viewfinder video");
    return video && video.videoWidth > 0;
  }, { timeout: 15000 });
  const size = await page.evaluate(() => {
    const video = document.querySelector(".tg-viewfinder video");
    return [video.videoWidth, video.videoHeight];
  });
  console.log(`   поток пошёл: ${size.join("×")}`);

  console.log("3. Прочие способы — кнопками под кадром, а не переключателем");
  const ways = await page.$$eval(".tg-ways .tg-way", (nodes) => nodes.map((n) => n.textContent.trim()));
  if (!ways.includes("Из галереи")) problems.push(`нет кнопки «Из галереи»: ${ways.join(" / ")}`);
  if (!ways.includes("Описать словами")) problems.push(`нет кнопки «Описать словами»: ${ways.join(" / ")}`);

  console.log("4. Повторить записанное можно в один тап — даже без повторов состава");
  await page.waitForSelector(".tg-usual-list button", { timeout: 15000 });
  const usual = await page.textContent(".tg-usual");
  if (!usual.includes("Плов с бараниной")) problems.push(`в «Повторить» нет вчерашнего ужина: ${usual.slice(0, 200)}`);
  if (!usual.includes("вчера")) problems.push(`разовая запись подписана не днём: ${usual.slice(0, 200)}`);

  console.log("5. Спуск затвора отправляет кадр на разбор");
  await page.click(".tg-shutter");
  await page.waitForSelector(".tg-draft", { timeout: 30000 });

  // Камера должна погаснуть на экране черновика, а не гореть поверх правки
  // граммов: индикатор съёмки там выглядит ровно так, как выглядит.
  const liveTracks = await page.evaluate(() => document.querySelectorAll(".tg-viewfinder video").length);
  if (liveTracks !== 0) problems.push("видоискатель остался жив на экране черновика");

  console.log("6. Черновик сохраняется приёмом пищи");
  await page.click('.tg-button-block:has-text("Сохранить")');
  await page.waitForSelector(".tg-today, .tg-hero", { timeout: 20000 });
  const saved = one(`SELECT count(*) FROM meals WHERE user_id = ${userId}`);
  if (saved !== "2") problems.push(`ожидали две записи в дневнике, в базе ${saved}`);

  console.log("7. Повтор из «Камеры» кладёт запись без обращения к разбору");
  await page.click('.tg-tabs button:has-text("Камера")');
  await page.waitForSelector(".tg-usual-list button", { timeout: 15000 });
  await page.click('.tg-usual-list button:has-text("Плов с бараниной")');
  await page.waitForSelector(".tg-draft", { timeout: 15000 });
  await page.click('.tg-button-block:has-text("Сохранить")');
  await page.waitForSelector(".tg-today, .tg-hero", { timeout: 20000 });
  const afterRepeat = one(`SELECT count(*) FROM meals WHERE user_id = ${userId}`);
  if (afterRepeat !== "3") problems.push(`после повтора ожидали три записи, в базе ${afterRepeat}`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\nПРОБЛЕМЫ:\n${problems.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\n=== ВКЛАДКА «КАМЕРА» СОШЛАСЬ ===");
}

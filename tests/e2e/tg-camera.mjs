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
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
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

/**
 * Неподвижный видеопоток из одного кадра Y4M.
 *
 * Встроенная поддельная камера Chromium не годится: в её картинке крутится
 * фигура и тикает таймер, движение между кадрами доходит до 0.03 — автоспуск
 * честно не срабатывает, и проверять было бы нечего. Файл же зацикливается
 * покадрово, а кадр здесь один: соседние кадры совпадают до байта, движение
 * ровно ноль. Клетка мелкая — чтобы кадр прошёл и по резкости.
 */
const WIDTH = 640;
const HEIGHT = 480;

function writeY4m(luma, chroma) {
  const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420mpeg2\nFRAME\n`, "ascii");
  const file = path.join(mkdtempSync(path.join(tmpdir(), "jt-cam-")), "static.y4m");
  writeFileSync(file, Buffer.concat([header, luma, chroma.u, chroma.v]));
  return file;
}

/** Шахматка: резкая, светлая, без всякой еды. */
function checkerVideoFile() {
  const cell = 16;
  const luma = Buffer.alloc(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      luma[y * WIDTH + x] = dark ? 60 : 200;
    }
  }
  // Цветность нейтральная: метрики кадра считаются по яркости.
  const flat = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2), 128);
  return writeY4m(luma, { u: flat, v: flat });
}

/**
 * Настоящая фотография блюда — для проверки распознавания.
 *
 * Плоскости считаются вручную, хотя у sharp есть `toColorspace("yuv420p")`.
 * Он здесь не годится и стоил отдельной отладки: отдаёт чересстрочный YUV
 * полного разрешения (640×480×3 байта), а Y4M ждёт планарный 4:2:0 (в
 * полтора раза меньше). Разницу файл не выдаёт — заголовок верный, длина
 * «похожа», — и в видоискателе просто оказывается цветной мусор, в котором
 * модель, разумеется, никакой еды не находит.
 */
async function photoVideoFile(source) {
  const { data: rgb } = await sharp(source)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const y = Buffer.alloc(WIDTH * HEIGHT);
  const u = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
  const v = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const p = (row * WIDTH + col) * 3;
      const r = rgb[p], g = rgb[p + 1], b = rgb[p + 2];
      y[row * WIDTH + col] = clamp(0.299 * r + 0.587 * g + 0.114 * b);
      // Цветность в 4:2:0 прорежена вдвое по обеим осям — берём каждый
      // второй пиксель каждой второй строки.
      if (row % 2 === 0 && col % 2 === 0) {
        const c = (row / 2) * (WIDTH / 2) + col / 2;
        u[c] = clamp(-0.169 * r - 0.331 * g + 0.5 * b + 128);
        v[c] = clamp(0.5 * r - 0.419 * g - 0.081 * b + 128);
      }
    }
  }
  return writeY4m(y, { u, v });
}

// FOOD_PHOTO — путь к настоящей фотографии блюда: с ней проверяется ещё и
// распознавание еды в кадре. Без неё берётся шахматка, и шаг с рамкой
// пропускается: молча «проверить» то, чего не проверяли, хуже, чем не
// проверять вовсе.
const FOOD_PHOTO = process.env.FOOD_PHOTO ?? null;
const VIDEO_FILE = FOOD_PHOTO ? await photoVideoFile(FOOD_PHOTO) : checkerVideoFile();

// Браузер запускается не через ./browser.mjs: нужен поддельный видеопоток, а
// он включается только флагами запуска. Настоящей камеры в среде нет.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${VIDEO_FILE}`,
  ],
});
const problems = [];
try {
  const context = await browser.newContext({
    viewport: { width: 420, height: 860 },
    permissions: ["camera"],
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`ошибка страницы: ${e.message}`));
  const TELEGRAM_STUB = `
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(signInitData(TG_USER_ID))},
      initDataUnsafe: { user: { first_name: "Марина" } },
      colorScheme: "light",
      themeParams: { bg_color: "#ffffff", secondary_bg_color: "#f4f1ea", text_color: "#171917",
        hint_color: "#75766f", link_color: "#2946c6", button_color: "#171917", button_text_color: "#ffffff" },
      MainButton: { text: "", show(){}, hide(){}, setText(){}, showProgress(){}, hideProgress(){},
        enable(){}, disable(){}, onClick(){}, offClick(){}, setParams(){} },
      BackButton: {
        isVisible: false,
        show(){ this.isVisible = true; },
        hide(){ this.isVisible = false; },
        onClick(cb){ window.__tgBack = cb; },
        offClick(){ window.__tgBack = null; },
      },
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
      ready(){}, expand(){}, onEvent(){}, offEvent(){},
    } };
`;
  await page.addInitScript(TELEGRAM_STUB);

  // Автоспуск на первом заходе выключен намеренно: он срабатывает секунды за
  // две, а модель распознавания едет с нуля дольше. С включённым автоспуском
  // видоискатель исчез бы раньше, чем появилась зелёная рамка, и шаг 5
  // проверял бы не то, что задумано. Сам автоспуск проверяется шагом 6.
  await page.addInitScript(() => window.localStorage.setItem("jt.camera.autoShot", "off"));
  // Распознавание еды выключено по умолчанию — оно тянет мегабайты и мешает
  // разбору на мобильном интернете. Здесь включаем явно, иначе проверять
  // было бы нечего.
  await page.addInitScript(() => window.localStorage.setItem("jt.camera.foodHint", "on"));

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

  if (FOOD_PHOTO) {
    console.log("5. Рамка зеленеет, когда в кадре узнана еда");
    // Модель качается с нуля, поэтому ждём дольше обычного. Автоспуск при
    // этом уже мог сработать — тогда видоискателя нет, и проверять нечего;
    // отдельного прогона ради этого не заводим, сравнение делает шаг ниже.
    await page.waitForSelector('.tg-viewfinder-frame[data-food="yes"]', { timeout: 45000 })
      .catch(() => problems.push("рамка не позеленела на фотографии еды"));
  } else {
    console.log("5. Распознавание еды не проверяется: FOOD_PHOTO не задан");
  }

  console.log("6. Автоспуск срабатывает сам на неподвижном резком кадре");
  // Возвращаем автоспуск и заходим на «Камеру» заново. Поток из файла
  // неподвижен и резок — ровно то состояние, ради которого автоспуск и
  // сделан. Кольцо отсчёта должно появиться до снимка: кадр без
  // предупреждения ощущается как сбой, а не как помощь.
  await page.evaluate(() => window.localStorage.removeItem("jt.camera.autoShot"));
  await page.click('.tg-tabs button:has-text("Сегодня")');
  await page.click('.tg-tabs button:has-text("Камера")');
  await page.waitForSelector(".tg-shutter-ring", { timeout: 20000 });
  await page.waitForSelector(".tg-draft", { timeout: 30000 });

  // Камера должна погаснуть на экране черновика, а не гореть поверх правки
  // граммов: индикатор съёмки там выглядит ровно так, как выглядит.
  const liveTracks = await page.evaluate(() => document.querySelectorAll(".tg-viewfinder video").length);
  if (liveTracks !== 0) problems.push("видоискатель остался жив на экране черновика");

  console.log("7. Черновик сохраняется приёмом пищи");
  await page.click('.tg-button-block:has-text("Сохранить")');
  await page.waitForSelector(".tg-today, .tg-hero", { timeout: 20000 });
  const saved = one(`SELECT count(*) FROM meals WHERE user_id = ${userId}`);
  if (saved !== "2") problems.push(`ожидали две записи в дневнике, в базе ${saved}`);

  console.log("8. С выключенным автоспуском кадр сам не снимается");
  await page.evaluate(() => window.localStorage.setItem("jt.camera.autoShot", "off"));
  await page.click('.tg-tabs button:has-text("Камера")');
  await page.waitForSelector(".tg-viewfinder video", { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector(".tg-viewfinder video")?.videoWidth > 0, { timeout: 15000 });
  // Ждём заведомо дольше, чем выдержка автоспуска: если он всё же взведён,
  // за это время появился бы черновик.
  await new Promise((resolve) => setTimeout(resolve, 4000));
  if (await page.$(".tg-draft")) problems.push("автоспуск сработал при выключенной настройке");
  if (await page.$(".tg-shutter-ring")) problems.push("кольцо отсчёта идёт при выключенной настройке");
  // Ручной спуск при этом обязан работать: настройка выключает автоматику,
  // а не съёмку.
  await page.click(".tg-shutter");
  await page.waitForSelector(".tg-draft", { timeout: 30000 });
  await page.click('.tg-button-block:has-text("Сохранить")');
  await page.waitForSelector(".tg-today, .tg-hero", { timeout: 20000 });
  await page.evaluate(() => window.localStorage.removeItem("jt.camera.autoShot"));

  console.log("9. По умолчанию модель распознавания не качается вовсе");
  // Отдельный контекст, а не reload текущего: addInitScript выполняется при
  // каждой навигации и вернул бы настройку обратно. Здесь проверяется именно
  // умолчание — то, что получит человек, ничего не трогавший в настройках.
  const plain = await browser.newContext({ viewport: { width: 420, height: 860 }, permissions: ["camera"] });
  const plainPage = await plain.newPage();
  const modelRequests = [];
  plainPage.on("request", (request) => { if (request.url().includes("/models/")) modelRequests.push(request.url()); });
  await plainPage.addInitScript(TELEGRAM_STUB);
  await plainPage.goto(`${BASE}/tg`);
  await plainPage.waitForSelector(".tg-app", { timeout: 20000 });
  await plainPage.click('.tg-tabs button:has-text("Камера")');
  await plainPage.waitForSelector(".tg-viewfinder video", { timeout: 15000 });
  // Ждём дольше, чем отложенный старт загрузки: если бы она была включена,
  // за это время запросы уже ушли бы.
  await new Promise((resolve) => setTimeout(resolve, 7000));
  if (modelRequests.length > 0) {
    problems.push(`по умолчанию запрошено ${modelRequests.length} файлов модели: ${modelRequests[0]}`);
  }
  if (await plainPage.$('.tg-viewfinder-frame[data-food="yes"]')) {
    problems.push("рамка позеленела при выключенном по умолчанию распознавании");
  }
  await plain.close();

  console.log("10. Крестик закрытия становится стрелкой на внутренних экранах");
  // На «Сегодня» кнопки быть не должно: там крестик закрывает приложение,
  // как и в самом Telegram.
  await page.click('.tg-tabs button:has-text("Сегодня")');
  const backOnHome = await page.evaluate(() => window.Telegram.WebApp.BackButton.isVisible);
  if (backOnHome) problems.push("стрелка «назад» показана на главном экране");

  await page.click('.tg-tabs button:has-text("Профиль")');
  const backOnProfile = await page.evaluate(() => window.Telegram.WebApp.BackButton.isVisible);
  if (!backOnProfile) problems.push("на «Профиле» стрелки «назад» нет");

  // И она действительно возвращает на главный, а не просто показывается.
  await page.evaluate(() => window.__tgBack?.());
  await page.waitForSelector('.tg-tabs button[aria-selected="true"]:has-text("Сегодня")', { timeout: 10000 })
    .catch(() => problems.push("нажатие «назад» не вернуло на «Сегодня»"));
  if (await page.evaluate(() => window.Telegram.WebApp.BackButton.isVisible)) {
    problems.push("стрелка осталась после возврата на главный экран");
  }

  console.log("11. Повтор из «Камеры» кладёт запись без обращения к разбору");
  await page.click('.tg-tabs button:has-text("Камера")');
  await page.waitForSelector(".tg-usual-list button", { timeout: 15000 });
  await page.click('.tg-usual-list button:has-text("Плов с бараниной")');
  await page.waitForSelector(".tg-draft", { timeout: 15000 });
  await page.click('.tg-button-block:has-text("Сохранить")');
  await page.waitForSelector(".tg-today, .tg-hero", { timeout: 20000 });
  const afterRepeat = one(`SELECT count(*) FROM meals WHERE user_id = ${userId}`);
  if (afterRepeat !== "4") problems.push(`после повтора ожидали четыре записи, в базе ${afterRepeat}`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.log(`\nПРОБЛЕМЫ:\n${problems.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\n=== ВКЛАДКА «КАМЕРА» СОШЛАСЬ ===");
}

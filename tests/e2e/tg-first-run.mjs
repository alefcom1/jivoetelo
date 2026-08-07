/**
 * Первые шаги в Mini App: подсказка Живело на «Сегодня».
 *
 * Правила показа проверяются юнит-тестом (tests/first-run.test.mjs) — там они
 * чистые функции. Здесь проверяется то, чего чистая функция не видит:
 * подсказка действительно нарисована карточкой, крестик — настоящая тач-цель,
 * отметка доходит до базы, а закрытая не возвращается после перезагрузки.
 *
 * Отдельно проверяется, что енот на экране один. Подсказка и карточка серии —
 * это один и тот же персонаж с одной и той же картинкой, и первая версия
 * рисовала обоих подряд: получались два сообщения от одного собеседника
 * вместо одного объяснения.
 *
 * И отдельно — что карточка выглядит карточкой. Классы первой версии
 * назывались `.tg-hint-card`, а это имя уже занято карточкой «здесь пока
 * нечего показать» на четырёх вкладках: подсказка молча получала от неё
 * `flex-direction: column`, енот уезжал наверх, подложка пропадала. Ошибка,
 * которую не видит ни один тип и ни один линтер, — только глаз или эта
 * проверка.
 *
 * Запуск: сервер на 3111, Postgres с миграциями.
 *   node tests/e2e/tg-first-run.mjs
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
const TG_USER_ID = 760000 + (Date.now() % 50000);
/** Минимальная тач-цель, о которой договорились по всему сервису. */
const MIN_TAP = 38;

const sql = (query) => execFileSync("psql", [...PSQL, "-c", query], { encoding: "utf8" }).trim();
const one = (query) => sql(query).split("\n")[0].trim();

const problems = [];
const expect = (ok, message) => { if (!ok) problems.push(message); };

/** Подписываем initData так же, как это делает Telegram. */
function signInitData(userId) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-first-run",
    user: JSON.stringify({ id: userId, first_name: "Марина" }),
  };
  const pairs = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(pairs.map(([k, v]) => `${k}=${v}`).join("\n")).digest("hex");
  const search = new URLSearchParams(params);
  search.set("hash", hash);
  return search.toString();
}

// Человек с планом и без единой записи — состояние первого шага.
const userId = Number(one(
  `INSERT INTO users (email, password_hash, telegram_user_id)
   VALUES ('e2e-firstrun-${Date.now()}@example.com', 'x', '${TG_USER_ID}') RETURNING id`,
));
sql(`INSERT INTO profiles (user_id, goal, sex_for_formula, birth_year, height_cm, activity)
     VALUES (${userId}, 'lose', 'female', 1992, 168, 'moderate')`);
sql(`INSERT INTO weight_entries (user_id, on_date, weight_kg) VALUES (${userId}, current_date, 70)`);

const initData = signInitData(TG_USER_ID);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await context.addInitScript(`
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(initData)},
      initDataUnsafe: { user: { id: ${TG_USER_ID}, first_name: "Марина" } },
      ready(){}, expand(){}, close(){},
      colorScheme: "light", themeParams: {},
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
      MainButton: { setText(){return this}, show(){return this}, hide(){return this}, onClick(){return this}, offClick(){return this}, showProgress(){return this}, hideProgress(){return this}, enable(){return this}, disable(){return this} },
      BackButton: { show(){return this}, hide(){return this}, onClick(){return this}, offClick(){return this} },
      onEvent(){}, offEvent(){},
    } };
  `);
  const page = await context.newPage();

  console.log("1. Новичку с планом показан первый шаг — и ровно один");
  await page.goto(`${BASE}/tg`, { waitUntil: "networkidle", timeout: 40000 });
  await page.waitForSelector(".tg-first", { timeout: 20000 });
  expect(await page.locator(".tg-first").count() === 1, "подсказок на экране больше одной");
  const text = (await page.locator(".tg-first").innerText()).replace(/\s+/g, " ");
  expect(text.includes("План готов"), `первым шагом показано не то: «${text.slice(0, 60)}»`);

  console.log("2. Живело на экране один");
  const raccoons = await page.locator('img[src*="/mascot/"]').count();
  expect(raccoons === 1, `енотов на экране ${raccoons} — подсказка и карточка серии показаны разом`);

  console.log("3. Подсказка выглядит карточкой, а не голым текстом");
  const look = await page.evaluate(() => {
    const el = document.querySelector(".tg-first");
    const style = getComputedStyle(el);
    const img = el.querySelector("img");
    const imgBox = img.getBoundingClientRect();
    const textBox = el.querySelector("p").getBoundingClientRect();
    return {
      transparent: style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent",
      // Енот слева от текста, а не над ним: именно это ломается при
      // столкновении имён классов.
      besideText: imgBox.right <= textBox.left + 1,
      imgWidth: Math.round(imgBox.width),
    };
  });
  expect(!look.transparent, "у карточки подсказки нет подложки — правило перебито или переменная цвета не та");
  expect(look.besideText, "енот стоит над текстом, а не слева — вероятно, столкновение имён классов");
  expect(look.imgWidth > 0 && look.imgWidth <= 80, `картинка енота ${look.imgWidth}px — размер не применился`);

  console.log("4. Крестик — настоящая тач-цель, и экран не едет вбок");
  const close = await page.locator(".tg-first-close").boundingBox();
  expect(
    close && close.width >= MIN_TAP && close.height >= MIN_TAP,
    `крестик ${close ? `${Math.round(close.width)}×${Math.round(close.height)}` : "не найден"}`,
  );
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, `экран уехал вбок на ${over}px`);

  console.log("5. Закрытая подсказка исчезает сразу и отмечается в базе");
  await page.locator(".tg-first-close").click();
  await page.waitForSelector(".tg-first", { state: "detached", timeout: 5000 })
    .catch(() => problems.push("закрытая подсказка осталась на экране"));
  await page.waitForTimeout(800);
  const stored = one(`SELECT first_run_hints FROM users WHERE id = ${userId}`);
  expect(stored.includes("firstMeal"), `отметка не дошла до базы: ${stored}`);
  // Вес внесён до первого захода — шаг про вес зачтён, хотя его не показывали.
  expect(stored.includes("weight"), `сделанное без подсказки не зачтено: ${stored}`);

  console.log("6. После перезагрузки закрытая не возвращается");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".tg-hero", { timeout: 20000 });
  await page.waitForTimeout(1200);
  const again = await page.locator(".tg-first").innerText().catch(() => "");
  expect(!again.includes("План готов"), "закрытая подсказка вернулась после перезагрузки");
} finally {
  await browser.close();
  sql(`DELETE FROM users WHERE id = ${userId}`);
}

if (problems.length) {
  console.log(`\nПРОБЛЕМЫ:\n${problems.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\n=== ПЕРВЫЕ ШАГИ В MINI APP СОШЛИСЬ ===");
}

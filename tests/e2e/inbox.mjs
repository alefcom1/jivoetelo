/**
 * Фото-инбокс целиком, до сохранения приёма пищи.
 *
 * Само получение фото ботом здесь не воспроизвести: для этого нужен доступ к
 * api.telegram.org, которого в тестовой среде нет. Поэтому снимок кладётся в
 * инбокс так же, как это сделал бы бот, — файлом в UPLOADS_DIR и строкой в
 * photo_inbox, — а дальше проверяется всё остальное: экран, разбор, перенос
 * времени съёмки в приём пищи и отклонение снимка вместе с файлом.
 *
 * Запуск: сервер на 3111 (AI_PROVIDER=mock), Postgres с миграциями.
 */

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launchBrowser } from "./browser.mjs";

const BASE = "http://127.0.0.1:3111";
const UPLOADS = process.env.UPLOADS_DIR;
const PSQL = ["-h", "127.0.0.1", "-p", process.env.PGPORT ?? "5433", "-U", "postgres", "-d", "jivoetelo", "-t", "-A"];
const email = `e2e-inbox-${Date.now()}@example.com`;
const password = "correct-horse-42";
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";
const TG_USER_ID = 730000 + (Date.now() % 60000);

/** Подписываем initData так же, как это делает Telegram. */
function signInitData(userId) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-inbox",
    user: JSON.stringify({ id: userId, first_name: "Марина" }),
  };
  const pairs = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(pairs.map(([k, v]) => `${k}=${v}`).join("\n")).digest("hex");
  const search = new URLSearchParams(params);
  search.set("hash", hash);
  return search.toString();
}

if (!UPLOADS) throw new Error("Нужен UPLOADS_DIR — тот же, с которым запущен сервер");

function sql(query) {
  // psql печатает после строки результата ещё и тег команды (INSERT 0 1),
  // поэтому берём именно первую строку.
  return execFileSync("psql", [...PSQL, "-c", query], { encoding: "utf8" }).trim().split("\n")[0].trim();
}

function step(name) {
  console.log(`--- ${name}`);
}

// Однопиксельный JPEG: содержимое не важно, разбор всё равно mock-овый.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

function addInboxPhoto(userId, { takenOn, takenTime, note }) {
  const key = `${userId}/e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`;
  const filePath = path.join(UPLOADS, key);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, TINY_JPEG);
  const id = sql(
    `INSERT INTO photo_inbox (user_id, photo_key, note, taken_on, taken_time)
     VALUES (${userId}, '${key}', ${note ? `'${note}'` : "NULL"}, '${takenOn}', '${takenTime}')
     RETURNING id`,
  );
  return { id: Number(id), key, filePath };
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  step("1. Регистрация");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  const userId = Number(sql(`SELECT id FROM users WHERE email = '${email}'`));

  step("2. Пустой инбокс объясняет, откуда берутся снимки");
  await page.goto(`${BASE}/app/inbox`);
  const emptyText = await page.textContent("main");
  if (!emptyText.includes("Инбокс пуст")) throw new Error("Нет пустого состояния инбокса");
  if (!emptyText.includes("Telegram")) throw new Error("Пустое состояние не объясняет, при чём тут бот");

  step("3. Бот кладёт два снимка");
  const lunch = addInboxPhoto(userId, { takenOn: "2026-07-20", takenTime: "13:40", note: "омлет с сыром" });
  const extra = addInboxPhoto(userId, { takenOn: "2026-07-20", takenTime: "09:15", note: null });

  await page.reload();
  const listText = await page.textContent("main");
  if (!listText.includes("2 снимка ждут разбора")) throw new Error(`Неверный счётчик: ${listText.slice(0, 200)}`);
  if (!listText.includes("омлет с сыром")) throw new Error("Подпись к снимку не показана");

  step("4. Превью снимка действительно отдаётся");
  const previewStatus = await page.evaluate(async (key) => {
    const response = await fetch(`/api/photos/${key}`);
    return response.status;
  }, lunch.key);
  if (previewStatus !== 200) throw new Error(`Превью недоступно: ${previewStatus}`);

  step("5. Разбор снимка: время съёмки подставлено заранее");
  await page.click(`a[href="/app/add?inbox=${lunch.id}"]`);
  await page.waitForSelector('h1:has-text("Снимок из инбокса")', { timeout: 15000 });
  const addText = await page.textContent("main");
  if (!addText.includes("20 июля в 13:40")) throw new Error(`Нет времени съёмки: ${addText.slice(0, 200)}`);

  await page.click('button:has-text("Разобрать")');
  await page.waitForSelector('h1:has-text("Проверьте разбор")', { timeout: 25000 });
  if ((await page.inputValue('input[type="date"]')) !== "2026-07-20") throw new Error("Дата не из момента съёмки");
  if ((await page.inputValue('input[type="time"]')) !== "13:40") throw new Error("Время не из момента съёмки");

  step("6. Сохранение переносит снимок из инбокса в дневник");
  await page.click('button:has-text("Сохранить")');
  await page.waitForURL("**/app?date=2026-07-20", { timeout: 15000 });

  const processed = sql(
    `SELECT (processed_at IS NOT NULL)::text || ' ' || (meal_id IS NOT NULL)::text FROM photo_inbox WHERE id = ${lunch.id}`,
  );
  if (processed !== "true true") throw new Error(`Снимок не отмечен разобранным: ${processed}`);

  const mealPhoto = sql(
    `SELECT m.photo_key || ' ' || m.eaten_time FROM meals m JOIN photo_inbox p ON p.meal_id = m.id WHERE p.id = ${lunch.id}`,
  );
  if (mealPhoto !== `${lunch.key} 13:40`) throw new Error(`Приём пищи не тот: ${mealPhoto}`);
  if (!existsSync(lunch.filePath)) throw new Error("Файл разобранного снимка не должен удаляться");

  step("7. Повторный заход на разобранный снимок возвращает в инбокс");
  await page.goto(`${BASE}/app/add?inbox=${lunch.id}`);
  await page.waitForURL("**/app/inbox", { timeout: 15000 });

  step("8. Отклонение снимка удаляет файл, но оставляет след");
  const beforeCount = await page.textContent(".inbox-count");
  if (!beforeCount.includes("1 снимок")) throw new Error(`Ожидали один оставшийся снимок: ${beforeCount}`);
  await page.click('button:has-text("Отклонить")');
  await page.waitForSelector('h1:has-text("Инбокс пуст")', { timeout: 15000 });

  const dismissed = sql(`SELECT (dismissed_at IS NOT NULL)::text FROM photo_inbox WHERE id = ${extra.id}`);
  if (dismissed !== "true") throw new Error("Отклонение не записано");
  if (existsSync(extra.filePath)) throw new Error("Файл отклонённого снимка должен быть удалён");

  step("9. Чужой снимок недоступен");
  const strangerId = Number(
    sql(`INSERT INTO users (email, password_hash) VALUES ('stranger-${Date.now()}@example.com', 'x') RETURNING id`),
  );
  const stranger = addInboxPhoto(strangerId, { takenOn: "2026-07-20", takenTime: "12:00", note: null });
  await page.goto(`${BASE}/app/add?inbox=${stranger.id}`);
  await page.waitForURL("**/app/inbox", { timeout: 15000 });
  const photoStatus = await page.evaluate(async (key) => (await fetch(`/api/photos/${key}`)).status, stranger.key);
  if (photoStatus === 200) throw new Error("Чужое фото отдаётся по прямой ссылке");

  step("10. Выгрузка аккаунта содержит инбокс");
  const exported = await page.evaluate(async () => await (await fetch("/api/account/export")).json());
  if (!Array.isArray(exported.фото_инбокс)) throw new Error("В выгрузке нет раздела фото-инбокса");
  if (exported.фото_инбокс.length !== 2) throw new Error(`Ожидали две записи, получили ${exported.фото_инбокс.length}`);

  step("11. Mini App: тот же инбокс внутри Telegram");
  sql(`UPDATE users SET telegram_user_id = '${TG_USER_ID}' WHERE id = ${userId}`);
  const forTelegram = addInboxPhoto(userId, { takenOn: "2026-07-21", takenTime: "08:30", note: "каша" });

  const tgPage = await browser.newPage();
  await tgPage.addInitScript(`
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
  await tgPage.goto(`${BASE}/tg`);
  await tgPage.waitForSelector(".tg-app", { timeout: 20000 });
  await tgPage.click('.tg-tabs button:has-text("Инбокс")');
  await tgPage.waitForSelector(".tg-inbox", { timeout: 15000 });
  const tgInboxText = await tgPage.textContent(".tg-inbox");
  if (!tgInboxText.includes("каша")) throw new Error(`Снимка нет в Mini App: ${tgInboxText.slice(0, 200)}`);

  step("12. Mini App: разбор снимка и сохранение");
  // Пауза под антифлуд: сценарий разбирает второе фото быстрее, чем это
  // возможно для человека, и продуктовый лимит в 3 секунды честно сработал бы.
  await new Promise((r) => setTimeout(r, 3200));
  await tgPage.click('.tg-inbox .tg-button:has-text("Разобрать")');
  await tgPage.waitForSelector('.tg-button-block:has-text("Разобрать")', { timeout: 15000 });
  await tgPage.click('.tg-button-block:has-text("Разобрать")');
  await tgPage.waitForSelector(".tg-draft", { timeout: 25000 });
  await tgPage.click('.tg-button-block:has-text("Сохранить")');
  await tgPage.waitForSelector(".tg-inbox, .tg-hero:has-text(\"Инбокс пуст\")", { timeout: 20000 });

  const tgProcessed = sql(
    `SELECT m.eaten_on || ' ' || m.eaten_time FROM meals m JOIN photo_inbox p ON p.meal_id = m.id WHERE p.id = ${forTelegram.id}`,
  );
  if (tgProcessed !== "2026-07-21 08:30") throw new Error(`Время съёмки не перенеслось: ${tgProcessed}`);

  step("13. Mini App: отклонение снимка");
  const toDismiss = addInboxPhoto(userId, { takenOn: "2026-07-21", takenTime: "19:00", note: null });
  await tgPage.reload();
  await tgPage.waitForSelector(".tg-app", { timeout: 20000 });
  await tgPage.click('.tg-tabs button:has-text("Инбокс")');
  await tgPage.waitForSelector(".tg-inbox", { timeout: 15000 });
  await tgPage.click('.tg-link-button:has-text("Отклонить")');
  await tgPage.waitForSelector('h1:has-text("Инбокс пуст")', { timeout: 15000 });
  if (existsSync(toDismiss.filePath)) throw new Error("Файл отклонённого снимка должен быть удалён");

  console.log("\nФото-инбокс: все проверки пройдены.");
} finally {
  await browser.close();
}

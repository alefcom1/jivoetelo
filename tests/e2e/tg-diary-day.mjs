/**
 * Mini App: запись за прошлый день и возврат туда, откуда открыли камеру.
 *
 * Два давних дефекта дневника (задачи №17 и №18 плана):
 *   1. «Добавить запись» на прошлом дне открывала камеру, а та сохраняла
 *      всегда сегодняшним числом — человек, дописывающий вчерашний ужин,
 *      портил себе оба дня сразу.
 *   2. После сохранения всегда открывалась «Сегодня», даже если пришли из
 *      «Дневника», — свою запись в том списке, где её заводили, увидеть
 *      было нельзя.
 *
 * Сценарий проверяет обе стороны контракта: запись из «Дневника» ложится в
 * выбранный день и возвращает в «Дневник» на тот же день, а запись через
 * нижнюю панель — как раньше, сегодняшним числом с возвратом на «Сегодня».
 *
 * Запуск (разбор не нужен, путь ручной):
 *   AI_PROVIDER=off … node .next/standalone/server.js
 *   node tests/e2e/tg-diary-day.mjs
 */

import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { launchBrowser } from "./browser.mjs";
import { completeOnboarding } from "./onboarding.mjs";

const BASE = "http://127.0.0.1:3111";
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";
const email = `e2e-diary-day-${Date.now()}@example.com`;
const password = "correct-horse-42";
const TG_USER_ID = 990000 + (Date.now() % 50000);

function step(name) { console.log(`--- ${name}`); }

const sql = (q) => execSync(
  `PGPASSWORD=jivoetelo psql -h 127.0.0.1 -p ${process.env.PGPORT ?? 55432} -U jivoetelo -d jivoetelo -At -c "${q.replaceAll('"', '\\"')}"`,
  { encoding: "utf8", shell: "/bin/bash" }).trim().split("\n")[0].trim();

function signInitData(userId) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-e2e-diary-day",
    signature: "AbCdEf_dummy-ed25519-signature",
    user: JSON.stringify({ id: userId, first_name: "Вера" }),
  };
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const search = new URLSearchParams(Object.entries(params));
  search.set("hash", createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return search.toString();
}

const initData = signInitData(TG_USER_ID);

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "x-telegram-init-data": initData, ...(options.headers ?? {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { /* пустое тело */ }
  return { status: response.status, body };
}

const TELEGRAM_STUB = `
  window.Telegram = { WebApp: {
    initData: ${JSON.stringify(initData)},
    initDataUnsafe: { user: { first_name: "Вера" } },
    colorScheme: "light",
    themeParams: { bg_color: "#ffffff", secondary_bg_color: "#f4f1ea", text_color: "#171917",
      hint_color: "#75766f", link_color: "#2946c6", button_color: "#171917", button_text_color: "#ffffff" },
    MainButton: {
      text: "",
      show(){ window.__mainShown = true; }, hide(){ window.__mainShown = false; },
      setText(t){ window.__mainText = t; },
      onClick(cb){ window.__mainCb = cb; }, offClick(){ window.__mainCb = null; },
      showProgress(){}, hideProgress(){}, enable(){}, disable(){}, setParams(){},
    },
    BackButton: { show(){}, hide(){}, onClick(){}, offClick(){} },
    HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} },
    ready(){}, expand(){}, onEvent(){}, offEvent(){},
  } };
`;

/** Через ручной путь «Собрать руками» кладёт в черновик первую подсказку. */
async function draftFromReference(ui, query) {
  await ui.waitForSelector('.tg-way:has-text("Собрать руками")', { timeout: 20000 });
  await ui.click('.tg-way:has-text("Собрать руками")');
  await ui.fill(".tg-add-item input[type=search]", query);
  await ui.waitForSelector(".tg-add-item-results button");
  await ui.click(".tg-add-item-results button");
  await ui.waitForSelector(".tg-draft li");
}

async function saveViaMainButton(ui) {
  await ui.waitForFunction(() => window.__mainShown && window.__mainText === "Сохранить", { timeout: 20000 });
  await ui.evaluate(() => window.__mainCb && window.__mainCb());
}

const activeTab = (ui) => ui.textContent(".tg-tabs button.active");

const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
const yesterdayRu = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" })
  .format(new Date(`${yesterday}T12:00:00Z`));

const browser = await launchBrowser();
try {
  step("1. Регистрация, план и привязка Telegram");
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
  await completeOnboarding(page, BASE);
  await page.goto(`${BASE}/app/settings`);
  await page.click('button:has-text("Получить код")');
  await page.waitForSelector(".link-code-box strong", { timeout: 20000 });
  const code = (await page.textContent(".link-code-box strong")).trim();
  const link = await api("/api/tg/link", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
  });
  if (link.status !== 200) throw new Error(`Привязка не удалась: ${link.status}`);
  const uid = sql(`SELECT id FROM users WHERE email = '${email}'`);

  const ui = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ui.addInitScript(TELEGRAM_STUB);
  await ui.goto(`${BASE}/tg`);
  await ui.waitForSelector(".tg-app", { timeout: 25000 });

  step("2. «Дневник» на вчерашнем дне честно называет день записи");
  await ui.click('.tg-tabs button:has-text("Дневник")');
  await ui.waitForSelector(".tg-diary-nav", { timeout: 20000 });
  await ui.click('.tg-diary-nav-btn[aria-label="Предыдущий день"]');
  await ui.waitForSelector(`.tg-diary-nav h1:has-text("${yesterdayRu}")`, { timeout: 20000 });
  await ui.waitForSelector(`.tg-hint:has-text("сохранится этим днём")`);

  step("3. «Добавить запись» открывает камеру с пометкой дня");
  await ui.click('button:has-text("Добавить запись")');
  await ui.waitForSelector(`.tg-kicker:has-text("Запись за ${yesterdayRu}")`, { timeout: 20000 });

  step("4. Собранная руками запись сохраняется вчерашним числом");
  await draftFromReference(ui, "гречка");
  await saveViaMainButton(ui);
  await ui.waitForSelector(".tg-diary-nav", { timeout: 25000 });

  step("5. Возврат — в «Дневник», на тот же день, запись на месте");
  const tab = (await activeTab(ui)).trim();
  if (tab !== "Дневник") throw new Error(`После сохранения открыта «${tab}», ожидали «Дневник»`);
  const heading = (await ui.textContent(".tg-diary-nav h1")).trim();
  if (heading !== yesterdayRu) throw new Error(`Дневник открыт на «${heading}», ожидали «${yesterdayRu}»`);
  await ui.waitForSelector('.tg-diary-meal:has-text("Гречка")', { timeout: 20000 });

  const eatenOn = sql(`SELECT eaten_on FROM meals WHERE user_id = ${uid} ORDER BY id DESC LIMIT 1`);
  if (eatenOn !== yesterday) throw new Error(`В базе eaten_on=${eatenOn}, ожидали ${yesterday}`);

  step("6. Контроль: «Сегодня» этой записи не видит");
  const today = await api("/api/tg/today");
  if (today.body.meals.length !== 0) {
    throw new Error(`На «Сегодня» ${today.body.meals.length} записей — вчерашняя протекла в сегодня`);
  }

  step("7. Камера из нижней панели — сегодняшним числом, возврат на «Сегодня»");
  await ui.click('.tg-tabs button:has-text("Камера")');
  const kicker = await ui.$('.tg-kicker:has-text("Запись за")');
  if (kicker) throw new Error("Камера из нижней панели пометилась прошлым днём");
  await draftFromReference(ui, "творог");
  await saveViaMainButton(ui);
  await ui.waitForSelector(".tg-meals li", { timeout: 25000 });
  const tabAfter = (await activeTab(ui)).trim();
  if (tabAfter !== "Сегодня") throw new Error(`После сохранения открыта «${tabAfter}», ожидали «Сегодня»`);
  const todayAfter = await api("/api/tg/today");
  if (todayAfter.body.meals.length !== 1) {
    throw new Error(`На «Сегодня» ${todayAfter.body.meals.length} записей, ожидали 1`);
  }

  console.log("E2E дневник за прошлый день OK — день записи и возврат совпадают с тем, откуда пришли");
} finally {
  await browser.close();
}

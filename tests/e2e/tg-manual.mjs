/**
 * Mini App: запись еды без модели.
 *
 * Проверяет то, ради чего справочник и заводился: **дневник наполняется при
 * выключенном разборе**. До сих пор `AddItem` жил только в черновике (то есть
 * после удачного разбора) и в правке сохранённой записи — то есть при
 * `AI_PROVIDER=off`, сбое прокси или исчерпанной квоте новую запись создать
 * было нечем. «Повторить» помогает, но только если в дневнике уже что-то есть.
 *
 * Сценарий сам проверяет, что разбор действительно выключен (шаг 8): иначе
 * зелёный прогон ничего не доказывал бы — ручной путь работает и с включённым
 * разбором тоже.
 *
 * Запуск (разбор обязательно выключен):
 *   AI_PROVIDER=off … node .next/standalone/server.js
 *   node tests/e2e/tg-manual.mjs
 */

import { createHmac } from "node:crypto";
import { launchBrowser } from "./browser.mjs";
import { completeOnboarding } from "./onboarding.mjs";

const BASE = "http://127.0.0.1:3111";
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";
const email = `e2e-manual-${Date.now()}@example.com`;
const password = "correct-horse-42";
const TG_USER_ID = 940000 + (Date.now() % 50000);

function step(name) { console.log(`--- ${name}`); }

function signInitData(userId) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-e2e-manual",
    signature: "AbCdEf_dummy-ed25519-signature",
    user: JSON.stringify({ id: userId, first_name: "Ирина" }),
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

/**
 * Заглушка Telegram. MainButton запоминает подпись и обработчик: внутри
 * Telegram главное действие шага живёт именно в ней, своей кнопки на экране
 * нет — нажать «Сохранить» в тесте иначе невозможно.
 */
const TELEGRAM_STUB = `
  window.Telegram = { WebApp: {
    initData: ${JSON.stringify(initData)},
    initDataUnsafe: { user: { first_name: "Ирина" } },
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

  const ui = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ui.addInitScript(TELEGRAM_STUB);
  await ui.goto(`${BASE}/tg`);
  await ui.waitForSelector(".tg-app", { timeout: 25000 });

  step("2. «Собрать руками» доступно сразу, без единой записи в дневнике");
  await ui.click('.tg-tabs button:has-text("Камера")');
  await ui.waitForSelector('.tg-way:has-text("Собрать руками")', { timeout: 20000 });
  await ui.click('.tg-way:has-text("Собрать руками")');
  await ui.waitForSelector(".tg-add-item input[type=search]");

  step("3. Поиск по справочнику и черновик без обращения к модели");
  await ui.fill(".tg-add-item input[type=search]", "творог");
  await ui.waitForSelector(".tg-add-item-results button");
  const hints = await ui.$$eval(".tg-add-item-name", (nodes) => nodes.map((n) => n.textContent));
  if (!hints[0].startsWith("Творог")) throw new Error(`Первой подсказкой не творог: ${hints[0]}`);
  await ui.click(".tg-add-item-results button");
  await ui.waitForSelector(".tg-draft li");
  const draftText = await ui.textContent(".tg-page");
  if (!draftText.includes("Ваша запись")) throw new Error("Заголовок ручного черновика не подставился");
  if (draftText.includes("Проверьте разбор")) throw new Error("Ручной черновик выдаёт себя за разбор модели");

  step("4. Ввод КБЖУ с упаковки добавляет вторую позицию");
  await ui.click('.tg-add-item-open:has-text("Добавить позицию")');
  await ui.click('button:has-text("Ввести КБЖУ вручную")');
  await ui.fill(".tg-add-item-manual input:not([type=number])", "Протеиновый батончик");
  const fields = await ui.$$(".tg-add-item-grid input");
  // Порядок полей: вес порции, ккал, белки, жиры, углеводы, клетчатка.
  const values = ["60", "350", "30", "10", "35", "5"];
  for (let i = 0; i < values.length; i++) await fields[i].fill(values[i]);
  await ui.click('.tg-add-item button:has-text("Добавить")');
  await ui.waitForFunction(() => document.querySelectorAll(".tg-draft li").length === 2);

  step("5. Из ручного ввода можно вернуться к поиску");
  await ui.click('.tg-add-item-open:has-text("Добавить позицию")');
  await ui.click('button:has-text("Ввести КБЖУ вручную")');
  await ui.waitForSelector(".tg-add-item-grid");
  await ui.click('button:has-text("Искать в справочнике")');
  await ui.waitForSelector(".tg-add-item input[type=search]");

  step("6. Пустой черновик не предлагает сохранение");
  await ui.click('.tg-add-item .tg-remove[aria-label="Закрыть"]');
  for (let i = 0; i < 2; i++) await ui.click('.tg-draft .tg-remove[aria-label="Убрать позицию"]');
  await ui.waitForSelector('.tg-hint:has-text("Позиций не осталось")');
  if (await ui.evaluate(() => window.__mainShown)) {
    throw new Error("Главная кнопка осталась на пустом черновике — нажатие ничего не сделает");
  }

  step("7. Собранная руками запись сохраняется и видна в дневнике");
  await ui.click('.tg-add-item-open:has-text("Добавить позицию")');
  await ui.fill(".tg-add-item input[type=search]", "гречка");
  await ui.waitForSelector(".tg-add-item-results button");
  await ui.click(".tg-add-item-results button");
  await ui.waitForSelector(".tg-draft li");
  const label = await ui.evaluate(() => window.__mainText);
  if (label !== "Сохранить") throw new Error(`На главной кнопке «${label}», ожидали «Сохранить»`);
  await ui.evaluate(() => window.__mainCb && window.__mainCb());
  await ui.waitForSelector(".tg-meals li", { timeout: 25000 });

  const today = await api("/api/tg/today");
  if (today.body.meals.length !== 1) throw new Error(`Записей ${today.body.meals.length}, ожидали 1`);
  // Гречка отварная: 180 г × 110/100 = 198 ккал.
  if (today.body.totals.kcal !== 198) throw new Error(`Итог ${today.body.totals.kcal}, ожидали 198`);

  step("8. Контроль: разбор действительно выключен");
  // Без этой проверки зелёный прогон ничего не доказывает: ручной путь
  // работает и при включённом разборе тоже.
  const form = new FormData();
  form.set("mode", "text");
  form.set("text", "Два сырника, ложка сметаны и капучино");
  const analyze = await fetch(`${BASE}/api/tg/analyze`, {
    method: "POST", headers: { "x-telegram-init-data": initData }, body: form,
  });
  if (analyze.status === 200) {
    throw new Error("Разбор ответил 200 — сервер запущен не с AI_PROVIDER=off, проверка недействительна");
  }
  const refusal = await analyze.json().catch(() => null);
  console.log(`    разбор отказал: ${analyze.status} ${refusal?.error ?? ""}`);

  console.log("E2E Mini App вручную OK — дневник наполняется с выключенным разбором");
} finally {
  await browser.close();
}

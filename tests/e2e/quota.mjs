import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3111";
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";
const email = `e2e-quota-${Date.now()}@example.com`;
const password = "correct-horse-42";
const TG_USER_ID = 810000 + (Date.now() % 90000);

function step(name) { console.log(`--- ${name}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(query) {
  return execSync(
    `psql -h 127.0.0.1 -p 55432 -U jivoetelo -d jivoetelo -t -A -c "${query.replaceAll('"', '\\"')}"`,
    { encoding: "utf8" },
  ).trim().split("\n")[0].trim();
}

function signInitData(userId, firstName) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-quota",
    signature: "AbCdEf_dummy-ed25519-signature",
    user: JSON.stringify({ id: userId, first_name: firstName }),
  };
  const pairs = Object.entries(params).filter(([k]) => k !== "hash").sort(([a], [b]) => a.localeCompare(b));
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(pairs.map(([k, v]) => `${k}=${v}`).join("\n")).digest("hex");
  const search = new URLSearchParams(Object.entries(params));
  search.set("hash", hash);
  return search.toString();
}

const initData = signInitData(TG_USER_ID, "Марина");
const tgHeaders = { "x-telegram-init-data": initData };

async function analyze(text) {
  const form = new FormData();
  form.set("mode", "text");
  form.set("text", text);
  const response = await fetch(`${BASE}/api/tg/analyze`, { method: "POST", headers: tgHeaders, body: form });
  let body = null;
  try { body = await response.json(); } catch { /* пусто */ }
  return { status: response.status, body };
}

// Глобальный предохранитель считает расход по всему сервису, поэтому следы
// прошлых прогонов пришлось бы разгребать вручную — чистим заранее.
sql("DELETE FROM ai_usage WHERE output_tokens >= 1000000");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());

  step("1. Регистрация и привязка Telegram");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  await page.goto(`${BASE}/app/settings`);
  await page.click('button:has-text("Получить код")');
  await page.waitForSelector(".link-code-box strong", { timeout: 15000 });
  const code = (await page.textContent(".link-code-box strong")).trim();
  const link = await fetch(`${BASE}/api/tg/link`, {
    method: "POST", headers: { ...tgHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ code }),
  });
  if (link.status !== 200) throw new Error(`Привязка не удалась: ${link.status}`);
  const userId = sql(`SELECT id FROM users WHERE email = '${email}'`);

  step("2. Новый пользователь на бесплатном тарифе");
  const plan = sql(`SELECT plan FROM users WHERE id = ${userId}`);
  if (plan !== "free") throw new Error(`Ожидали free, получили ${plan}`);

  step("3. Первый разбор проходит и пишется в учёт");
  const first = await analyze("Гречка с курицей");
  if (first.status !== 200) throw new Error(`Первый разбор: ${first.status} ${JSON.stringify(first.body)}`);
  const rows = sql(`SELECT count(*) FROM ai_usage WHERE user_id = ${userId}`);
  if (rows !== "1") throw new Error(`В учёте ${rows} строк, ожидали 1`);
  const tokens = sql(`SELECT input_tokens || '/' || output_tokens FROM ai_usage WHERE user_id = ${userId}`);
  if (tokens !== "620/380") throw new Error(`Токены не записались: ${tokens}`);

  step("4. Антифлуд: повтор сразу же отклоняется");
  const tooFast = await analyze("Овсянка");
  if (tooFast.status !== 429) throw new Error(`Ожидали 429, получили ${tooFast.status}`);
  if (!/секунд/i.test(tooFast.body?.error ?? "")) throw new Error(`Непонятное сообщение: ${tooFast.body?.error}`);
  const afterFlood = sql(`SELECT count(*) FROM ai_usage WHERE user_id = ${userId}`);
  if (afterFlood !== "1") throw new Error("Отклонённый запрос попал в учёт");

  step("5. После паузы разбор снова доступен");
  await sleep(3100);
  const second = await analyze("Творог с ягодами");
  if (second.status !== 200) throw new Error(`Второй разбор: ${second.status}`);

  step("6. Дневной лимит: добиваем учёт до предела");
  // Лимит по тексту — 40; уже израсходовано 2.
  sql(`INSERT INTO ai_usage (user_id, on_date, kind, input_tokens, output_tokens)
       SELECT ${userId}, CURRENT_DATE, 'analyze_text', 620, 380 FROM generate_series(1, 38)`);
  await sleep(3100);
  const limited = await analyze("Ещё одно блюдо");
  if (limited.status !== 429) throw new Error(`Ожидали 429 по лимиту, получили ${limited.status}`);
  const message = limited.body?.error ?? "";
  if (!message.includes("40")) throw new Error(`Сообщение не называет лимит: ${message}`);
  if (!/вручную/.test(message)) throw new Error(`Сообщение не предлагает выход: ${message}`);
  for (const forbidden of ["злоупотреб", "превысили", "запрещ"]) {
    if (message.toLowerCase().includes(forbidden)) throw new Error(`Обвиняющая формулировка: ${message}`);
  }

  step("7. Лимиты раздельные: фото ещё доступно");
  await sleep(3100);
  const photoForm = new FormData();
  photoForm.set("mode", "photo");
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  photoForm.set("photo", new File([png], "meal.png", { type: "image/png" }));
  const photoResp = await fetch(`${BASE}/api/tg/analyze`, { method: "POST", headers: tgHeaders, body: photoForm });
  if (photoResp.status !== 200) throw new Error(`Фото должно быть доступно: ${photoResp.status}`);

  step("8. Ручная запись еды работает без лимита");
  const manual = await fetch(`${BASE}/api/tg/meals`, {
    method: "POST",
    headers: { ...tgHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      mealType: "lunch",
      items: [{ name: "Гречка", grams: 200, kcalPer100: 110, proteinPer100: 4.2, fatPer100: 1.1, carbsPer100: 21.3, fiberPer100: 3.7, confidence: "high" }],
    }),
  });
  if (manual.status !== 200) throw new Error(`Ручное сохранение: ${manual.status}`);

  step("9. Глобальный предохранитель по стоимости");
  // 6M выходных токенов ≈ $150 > потолка $25. Проверяем на фото:
  // по нему лимит ещё не исчерпан, значит дойдём именно до предохранителя.
  sql(`INSERT INTO ai_usage (user_id, on_date, kind, input_tokens, output_tokens)
       VALUES (${userId}, CURRENT_DATE, 'suggest', 0, 6000000)`);
  await sleep(3100);
  const budgetForm = new FormData();
  budgetForm.set("mode", "photo");
  budgetForm.set("photo", new File([png], "meal.png", { type: "image/png" }));
  const budgetStopped = await fetch(`${BASE}/api/tg/analyze`, { method: "POST", headers: tgHeaders, body: budgetForm });
  const budgetBody = await budgetStopped.json();
  if (budgetStopped.status !== 429) throw new Error(`Предохранитель не сработал: ${budgetStopped.status}`);
  if (!/нагрузк/i.test(budgetBody.error ?? "")) throw new Error(`Непонятное сообщение: ${budgetBody.error}`);
  sql(`DELETE FROM ai_usage WHERE user_id = ${userId} AND output_tokens = 6000000`);

  step("10. Панель расхода в настройках показывает цифры");
  await page.goto(`${BASE}/app/settings`);
  const settingsText = await page.textContent("main");
  if (!settingsText.includes("Тариф: бесплатный")) throw new Error("Нет отметки о бесплатном тарифе");
  if (!settingsText.includes("из 40")) throw new Error(`Нет счётчика текстовых разборов: ${settingsText.slice(0, 300)}`);
  if (!settingsText.includes("из 20")) throw new Error("Нет счётчика разборов по фото");
  await page.screenshot({ path: "/home/user/jivoetelo/docs/screenshots/settings-usage.png", fullPage: true });

  step("11. Веб-разбор подчиняется тому же лимиту");
  await page.goto(`${BASE}/app/add`);
  await page.waitForSelector("textarea");
  await page.fill("textarea", "Ещё одно блюдо в вебе");
  await page.click('button:has-text("Разобрать")');
  await page.waitForSelector(".form-error", { timeout: 20000 });
  const webError = await page.textContent(".form-error");
  if (!webError.includes("40") && !/секунд/i.test(webError)) {
    throw new Error(`Веб не показал сообщение о лимите: ${webError}`);
  }

  console.log("E2E quota OK");
} finally {
  await browser.close();
}

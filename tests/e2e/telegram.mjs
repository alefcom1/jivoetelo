import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3111";
const BOT_TOKEN = "123456:TEST-BOT-TOKEN-FOR-UNIT-TESTS";
const email = `e2e-tg-${Date.now()}@example.com`;
const password = "correct-horse-42";
const TG_USER_ID = 700000 + (Date.now() % 100000);

function step(name) { console.log(`--- ${name}`); }

function sql(query) {
  return execSync(
    `psql -h 127.0.0.1 -p 55432 -U jivoetelo -d jivoetelo -t -A -c "${query.replaceAll('"', '\\"')}"`,
    { encoding: "utf8" },
  ).trim().split("\n")[0].trim();
}

function signInitData(userId, firstName) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF-e2e",
    signature: "AbCdEf_dummy-ed25519-signature",
    user: JSON.stringify({ id: userId, first_name: firstName }),
  };
  const pairs = Object.entries(params)
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const search = new URLSearchParams(Object.entries(params));
  search.set("hash", hash);
  return search.toString();
}

const initData = signInitData(TG_USER_ID, "Марина");
const tgHeaders = { "x-telegram-init-data": initData };

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...tgHeaders, ...(options.headers ?? {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { /* пустое тело */ }
  return { status: response.status, body };
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  step("1. Регистрация в вебе + план (нужен для целей и советов)");
  const page = await browser.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  await page.goto(`${BASE}/app/onboarding`);
  await page.check('input[name="goal"][value="maintain"]');
  await page.check('input[name="sexForFormula"][value="female"]');
  await page.fill('input[name="birthYear"]', "1990");
  await page.fill('input[name="heightCm"]', "168");
  await page.fill('input[name="weightKg"]', "65");
  await page.check('input[name="activity"][value="light"]');
  await page.click('button:has-text("Посчитать мой план")');
  await page.waitForURL("**/app", { timeout: 15000 });

  step("2. Подделанная подпись отклоняется (401)");
  const forged = new URLSearchParams(initData);
  forged.set("user", JSON.stringify({ id: 999999999, first_name: "Чужой" }));
  const forgedResp = await fetch(`${BASE}/api/tg/today`, { headers: { "x-telegram-init-data": forged.toString() } });
  if (forgedResp.status !== 401) throw new Error(`Подделка прошла: ${forgedResp.status}`);

  step("3. Валидная подпись без привязки → 403 not_linked");
  const unlinked = await api("/api/tg/today");
  if (unlinked.status !== 403 || unlinked.body?.reason !== "not_linked") {
    throw new Error(`Ожидали 403 not_linked, получили ${unlinked.status} ${JSON.stringify(unlinked.body)}`);
  }

  step("4. Получение кода в веб-настройках");
  await page.goto(`${BASE}/app/settings`);
  await page.click('button:has-text("Получить код")');
  await page.waitForSelector(".link-code-box strong", { timeout: 15000 });
  const code = (await page.textContent(".link-code-box strong")).trim();
  if (!/^[0-9A-F]{8}$/.test(code)) throw new Error(`Неожиданный формат кода: ${code}`);

  step("5. Неверный код отклоняется");
  const badLink = await api("/api/tg/link", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "DEADBEEF" }),
  });
  if (badLink.status !== 400) throw new Error(`Неверный код прошёл: ${badLink.status}`);

  step("6. Привязка настоящим кодом");
  const link = await api("/api/tg/link", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
  });
  if (link.status !== 200 || link.body?.email !== email) {
    throw new Error(`Привязка не удалась: ${link.status} ${JSON.stringify(link.body)}`);
  }

  step("7. Повторное использование кода отклоняется");
  const reuse = await api("/api/tg/link", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
  });
  if (reuse.status !== 400) throw new Error(`Код сработал повторно: ${reuse.status}`);

  step("8. /today отдаёт цели из общего бэкенда");
  const today = await api("/api/tg/today");
  if (today.status !== 200) throw new Error(`today: ${today.status}`);
  if (today.body.targets?.kcalMin !== 1740 || today.body.targets?.kcalMax !== 2000) {
    throw new Error(`Цели не совпали: ${JSON.stringify(today.body.targets)}`);
  }
  if (today.body.meals.length !== 0) throw new Error("Ожидали пустой день");

  step("9. Разбор еды текстом через Mini App API");
  const analyzeForm = new FormData();
  analyzeForm.set("mode", "text");
  analyzeForm.set("text", "Два сырника, ложка сметаны и капучино");
  const analyzeResp = await fetch(`${BASE}/api/tg/analyze`, { method: "POST", headers: tgHeaders, body: analyzeForm });
  const analyzed = await analyzeResp.json();
  if (analyzeResp.status !== 200 || !Array.isArray(analyzed.analysis?.items)) {
    throw new Error(`Разбор не удался: ${analyzeResp.status} ${JSON.stringify(analyzed)}`);
  }
  if (analyzed.analysis.clarifications.length === 0) throw new Error("Ожидали уточняющий вопрос");

  step("10. Сохранение приёма пищи");
  const items = analyzed.analysis.items.map((item) => ({
    name: item.name,
    grams: item.estimatedGrams,
    kcalPer100: item.per100g.kcal,
    proteinPer100: item.per100g.protein,
    fatPer100: item.per100g.fat,
    carbsPer100: item.per100g.carbs,
    fiberPer100: item.per100g.fiber,
    confidence: item.confidence,
  }));
  const saved = await api("/api/tg/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mealType: "breakfast", items, sourceText: analyzed.sourceText, analysis: analyzed.analysis }),
  });
  if (saved.status !== 200) throw new Error(`Сохранение не удалось: ${saved.status} ${JSON.stringify(saved.body)}`);

  step("11. Данные видны и в Mini App, и в вебе (один бэкенд)");
  const after = await api("/api/tg/today");
  if (after.body.meals.length !== 1) throw new Error("Приём не появился в Mini App");
  // 180 г сырников (220/100) + 30 г сметаны (200/100) = 396 + 60 = 456
  if (after.body.totals.kcal !== 456) throw new Error(`Итог ${after.body.totals.kcal}, ожидали 456`);
  await page.goto(`${BASE}/app`);
  const webText = await page.textContent("main");
  if (!webText.includes("456")) throw new Error("Приём из Telegram не виден в вебе");
  if (!webText.includes("Завтрак")) throw new Error("Тип приёма не сохранился");

  step("12. Совет «что съесть дальше» через Mini App");
  const suggest = await api("/api/tg/suggest");
  if (suggest.status !== 200 || suggest.body.needsPlan) throw new Error(`suggest: ${JSON.stringify(suggest.body)}`);
  if (suggest.body.suggestions.length !== 3) throw new Error(`Ожидали 3 варианта, got ${suggest.body.suggestions.length}`);
  // Остаток: середина диапазона 1870 − 456 = 1414
  if (suggest.body.context.remainingKcal !== 1414) {
    throw new Error(`Остаток ${suggest.body.context.remainingKcal}, ожидали 1414`);
  }

  step("13. Изоляция: чужой Telegram не видит данные");
  const otherInit = signInitData(TG_USER_ID + 1, "Другой");
  const otherResp = await fetch(`${BASE}/api/tg/today`, { headers: { "x-telegram-init-data": otherInit } });
  if (otherResp.status !== 403) throw new Error(`Чужой аккаунт получил доступ: ${otherResp.status}`);

  step("14. UI Mini App: рендер с эмуляцией Telegram");
  const uiPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await uiPage.addInitScript(`
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(initData)},
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
  await uiPage.goto(`${BASE}/tg`);
  await uiPage.waitForSelector(".tg-app", { timeout: 20000 });
  const tgText = await uiPage.textContent(".tg-app");
  for (const expected of ["Марина", "Завтрак", "Белок", "Клетчатка"]) {
    if (!tgText.includes(expected)) throw new Error(`В Mini App нет «${expected}»`);
  }
  if (!tgText.includes("456")) throw new Error("Кольцо энергии не показывает итог дня");
  await uiPage.screenshot({ path: "/home/user/jivoetelo/docs/screenshots/tg-today.png" });

  step("15. UI: вкладка «Добавить» — разбор и правка");
  await uiPage.click('.tg-tabs button:has-text("Добавить")');
  await uiPage.waitForSelector("textarea");
  await uiPage.fill("textarea", "Гречка с курицей");
  await uiPage.screenshot({ path: "/home/user/jivoetelo/docs/screenshots/tg-add.png" });
  await uiPage.click('.tg-button:has-text("Разобрать")');
  await uiPage.waitForSelector(".tg-draft", { timeout: 25000 });
  const draftCount = await uiPage.$$(".tg-draft li");
  if (draftCount.length < 2) throw new Error("Черновик разбора пуст");
  await uiPage.click('.tg-clarify button:has-text("Да, с сахаром")');
  const afterClarify = await uiPage.$$(".tg-draft li");
  if (afterClarify.length !== draftCount.length + 1) throw new Error("Уточнение не добавило позицию");
  await uiPage.click('.tg-stepper button[aria-label="Больше"]');
  await uiPage.screenshot({ path: "/home/user/jivoetelo/docs/screenshots/tg-draft.png" });

  step("16. UI: сохранение возвращает на «Сегодня»");
  await uiPage.click('.tg-button:has-text("Сохранить")');
  await uiPage.waitForSelector(".tg-meals li:nth-child(2)", { timeout: 20000 });

  step("17. UI: вкладка «Совет»");
  await uiPage.click('.tg-tabs button:has-text("Совет")');
  await uiPage.waitForSelector('.tg-button:has-text("Подобрать варианты")');
  await uiPage.click('.tg-button:has-text("Подобрать варианты")');
  await uiPage.waitForSelector(".tg-suggestion", { timeout: 25000 });
  const suggestions = await uiPage.$$(".tg-suggestion");
  if (suggestions.length !== 3) throw new Error(`В UI ${suggestions.length} вариантов`);
  await uiPage.screenshot({ path: "/home/user/jivoetelo/docs/screenshots/tg-suggest.png" });

  step("18. UI: тёмная тема Telegram применяется");
  const darkPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await darkPage.addInitScript(`
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(initData)},
      initDataUnsafe: { user: { first_name: "Марина" } },
      colorScheme: "dark",
      themeParams: { bg_color: "#17212b", secondary_bg_color: "#0e1621", text_color: "#f5f5f5",
        hint_color: "#708499", link_color: "#6ab3f3", button_color: "#5288c1", button_text_color: "#ffffff" },
      MainButton: { text: "", show(){}, hide(){}, setText(){}, showProgress(){}, hideProgress(){},
        enable(){}, disable(){}, onClick(){}, offClick(){}, setParams(){} },
      BackButton: { show(){}, hide(){}, onClick(){}, offClick(){} },
      ready(){}, expand(){}, onEvent(){}, offEvent(){},
    } };
  `);
  await darkPage.goto(`${BASE}/tg`);
  await darkPage.waitForSelector(".tg-app", { timeout: 20000 });
  const scheme = await darkPage.evaluate(() => document.documentElement.dataset.tgScheme);
  if (scheme !== "dark") throw new Error(`Тёмная тема не применилась: ${scheme}`);
  const bg = await darkPage.evaluate(() =>
    getComputedStyle(document.querySelector(".tg-root")).getPropertyValue("--tg-bg").trim());
  if (bg !== "#0e1621") throw new Error(`Фон Telegram не подхватился: ${bg}`);
  await darkPage.screenshot({ path: "/home/user/jivoetelo/docs/screenshots/tg-today-dark.png" });

  step("19. Отвязка Telegram в вебе снимает доступ");
  await page.goto(`${BASE}/app/settings`);
  await page.click('button:has-text("Отвязать Telegram")');
  await page.waitForSelector('button:has-text("Получить код")', { timeout: 15000 });
  const afterUnlink = await api("/api/tg/today");
  if (afterUnlink.status !== 403) throw new Error(`После отвязки доступ остался: ${afterUnlink.status}`);

  const linkedInDb = sql(`SELECT telegram_user_id FROM users WHERE email = '${email}'`);
  if (linkedInDb !== "") throw new Error(`В БД осталась привязка: ${linkedInDb}`);

  console.log("E2E Telegram OK");
} finally {
  await browser.close();
}

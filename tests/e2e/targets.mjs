import { chromium } from "/home/user/jivoetelo/node_modules/playwright/index.mjs";

const BASE = "http://127.0.0.1:3111";
const email = `e2e-m3-${Date.now()}@example.com`;
const password = "correct-horse-42";

function step(name) {
  console.log(`--- ${name}`);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const page = await browser.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  step("1. Регистрация нового пользователя");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });

  step("2. Баннер «Настройте план» виден без профиля");
  if (!(await page.textContent("main")).includes("Настройте стартовый план")) {
    throw new Error("Нет баннера онбординга");
  }

  step("3. Онбординг: профиль 1990 г., 168 см, 65 кг, лёгкая активность");
  await page.click('a[href="/app/onboarding"]');
  await page.waitForSelector(".onboarding-form");
  await page.check('input[name="goal"][value="maintain"]');
  await page.check('input[name="sexForFormula"][value="female"]');
  await page.fill('input[name="birthYear"]', "1990");
  await page.fill('input[name="heightCm"]', "168");
  await page.fill('input[name="weightKg"]', "65");
  await page.check('input[name="activity"][value="light"]');
  await page.click('button:has-text("Посчитать мой план")');
  await page.waitForURL("**/app", { timeout: 15000 });

  step("4. Цели видны в итогах дня (~1870 ккал, белок ~104 г)");
  const dayText = await page.textContent("main");
  // На «Сегодня» показываем точечный ориентир: диапазон живёт на странице расчёта
  // и в предложении по плану, а в дневной сводке от него больше шума, чем пользы.
  if (!dayText.includes("из ~1870")) throw new Error(`Нет ориентира по калориям: ${dayText.slice(0, 300)}`);
  if (!dayText.includes("104")) throw new Error("Нет цели по белку");
  if (dayText.includes("Настройте стартовый план")) throw new Error("Баннер онбординга не исчез");

  step("5. Карточка «Что съесть дальше» → варианты (mock)");
  await page.click(".next-card");
  await page.waitForSelector('h1:has-text("Что съесть дальше?")');
  const nextIntro = await page.textContent("main");
  if (!nextIntro.match(/Остаток на сегодня: примерно \d+ ккал/)) throw new Error(`Нет остатка дня: ${nextIntro.slice(0, 300)}`);
  await page.click('button:has-text("Подобрать варианты")');
  await page.waitForSelector(".suggestion", { timeout: 20000 });
  const suggestions = await page.$$(".suggestion");
  if (suggestions.length !== 3) throw new Error(`Ожидали 3 варианта, получили ${suggestions.length}`);
  const suggestionText = await page.textContent(".suggestions");
  if (!suggestionText.includes("белок")) throw new Error("В вариантах нет белка");

  step("6. Вес: запись создана онбордингом, добавляем вторую");
  await page.click('a[href="/app/weight"]');
  await page.waitForSelector(".weight-form");
  let weightText = await page.textContent("main");
  if (!weightText.includes("65")) throw new Error("Нет стартового веса из онбординга");
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
  await page.fill('input[name="onDate"]', yesterday);
  await page.fill('input[name="weightKg"]', "65.8");
  await page.click('button:has-text("Записать")');
  await page.waitForSelector(".weight-saved", { timeout: 15000 });
  await page.reload();
  weightText = await page.textContent("main");
  if (!weightText.includes("65.8")) throw new Error("Второй замер не появился");
  if (!weightText.includes("тренд")) throw new Error("Нет тренда");

  step("7. Изменение плана: цель «снижение» уменьшает диапазон");
  await page.goto(`${BASE}/app/onboarding`);
  await page.check('input[name="goal"][value="lose"]');
  await page.check('input[name="sexForFormula"][value="female"]');
  await page.fill('input[name="birthYear"]', "1990");
  await page.fill('input[name="heightCm"]', "168");
  await page.fill('input[name="weightKg"]', "65");
  await page.check('input[name="activity"][value="light"]');
  await page.click('button:has-text("Посчитать мой план")');
  await page.waitForURL("**/app", { timeout: 15000 });
  const loseText = await page.textContent("main");
  const match = loseText.match(/из ~(\d{4})/);
  if (!match || Number(match[1]) >= 1870) throw new Error(`Ориентир не уменьшился: ${match?.[0]}`);

  console.log("E2E M3 OK");
} finally {
  await browser.close();
}

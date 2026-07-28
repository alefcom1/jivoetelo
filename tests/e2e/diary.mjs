import { chromium } from "/home/user/jivoetelo/node_modules/playwright/index.mjs";

const BASE = "http://127.0.0.1:3111";
const email = `e2e-${Date.now()}@example.com`;
const password = "correct-horse-42";

function step(name) {
  console.log(`--- ${name}`);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
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

  step("2. Пустой день");
  if (!(await page.textContent("main")).includes("Пока пусто")) throw new Error("Нет пустого состояния");

  step("3. Добавление текстом → разбор (mock)");
  await page.click('a[href="/app/add"]');
  await page.waitForSelector("textarea");
  await page.fill("textarea", "Два сырника, ложка сметаны и капучино");
  await page.click('button:has-text("Разобрать")');
  await page.waitForSelector('h1:has-text("Проверьте разбор")', { timeout: 20000 });

  step("4. Уточнение: выбираем «Да, с сахаром» → добавляется позиция");
  await page.click('.clarification button:has-text("Да, с сахаром")');
  const itemInputs = await page.$$(".draft-item");
  if (itemInputs.length !== 3) throw new Error(`Ожидали 3 позиции после уточнения, получили ${itemInputs.length}`);

  step("5. Правка веса первой позиции: 180 → 200 г");
  await page.fill('.draft-item:first-child input[type="number"]', "200");

  step("6. Сохранение");
  await page.click('button:has-text("Сохранить")');
  await page.waitForURL("**/app?date=*", { timeout: 15000 });

  step("7. Проверка ленты дня и итогов");
  const dayText = await page.textContent("main");
  if (!dayText.includes("Завтрак")) throw new Error("Нет приёма «Завтрак» в ленте");
  // 200 г сырников (220 ккал/100) + 30 г сметаны (200/100) + 10 г сахара (398/100) = 440+60+40 = 540
  if (!dayText.includes("540")) throw new Error(`Итог дня не совпал, текст: ${dayText.slice(0, 400)}`);

  step("8. Детали приёма");
  await page.click(".day-meal");
  await page.waitForSelector(".meal-items");
  const detailText = await page.textContent("main");
  for (const expected of ["Сырники", "Сметана", "Сахар", "Итого"]) {
    if (!detailText.includes(expected)) throw new Error(`В деталях нет «${expected}»`);
  }

  step("9. Скрытие калорий в настройках");
  await page.click('a[href="/app/settings"]');
  await page.click('button:has-text("Скрыть калории")');
  await page.waitForSelector('button:has-text("Показывать калории")');
  await page.goto(`${BASE}/app`);
  const noKcal = await page.textContent("main");
  if (noKcal.includes("540")) throw new Error("Калории видны при выключенной настройке");
  if (!noKcal.match(/белок/i)) throw new Error("Белок пропал вместе с калориями");

  step("10. Удаление приёма (с подтверждением)");
  await page.click(".day-meal");
  await page.waitForSelector(".meal-items");
  await page.click('button:has-text("Удалить запись")');
  await page.waitForURL("**/app?date=*", { timeout: 15000 });
  if (!(await page.textContent("main")).includes("Пока пусто")) throw new Error("Приём не удалился");

  step("11. Выход и защита маршрутов");
  await page.click('button:has-text("Выйти")');
  await page.waitForURL(BASE + "/", { timeout: 15000 });
  const resp = await page.goto(`${BASE}/app`);
  if (!resp.url().includes("/login")) throw new Error("После выхода /app не редиректит на /login");

  console.log("E2E OK");
} finally {
  await browser.close();
}

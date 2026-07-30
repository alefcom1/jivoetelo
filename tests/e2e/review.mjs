import { execSync } from "node:child_process";
import { launchBrowser } from "./browser.mjs";
import { completeOnboarding } from "./onboarding.mjs";

const BASE = "http://127.0.0.1:3111";
const email = `e2e-m4-${Date.now()}@example.com`;
const password = "correct-horse-42";

function step(name) {
  console.log(`--- ${name}`);
}

function sql(query) {
  const out = execSync(
    `psql -h 127.0.0.1 -p 55432 -U jivoetelo -d jivoetelo -t -A -c "${query.replaceAll('"', '\\"')}"`,
    { encoding: "utf8" },
  ).trim();
  return out.split("\n")[0].trim();
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  step("1. Регистрация и онбординг (цель: снижение)");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  await completeOnboarding(page, BASE, { goal: "lose" });

  step("2. Сидируем неделю: 6 дней еды и 10 дней плоского веса");
  const userId = sql(`SELECT id FROM users WHERE email = '${email}'`);
  if (!userId) throw new Error("Пользователь не найден в БД");
  for (let i = 1; i <= 6; i++) {
    const mealId = sql(
      `INSERT INTO meals (user_id, eaten_on, eaten_time, meal_type) VALUES (${userId}, CURRENT_DATE - ${i}, '13:00', 'lunch') RETURNING id`,
    );
    sql(
      `INSERT INTO meal_items (meal_id, name, grams, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, fiber_per_100) VALUES (${mealId}, 'Обед', 800, 200, 8, 6, 25, 2)`,
    );
  }
  for (let i = 1; i <= 9; i++) {
    sql(`INSERT INTO weight_entries (user_id, on_date, weight_kg) VALUES (${userId}, CURRENT_DATE - ${i}, 65) ON CONFLICT DO NOTHING`);
  }

  step("3. Обзор: секции и среднее по записанным дням");
  await page.goto(`${BASE}/app/review`);
  const reviewText = await page.textContent("main");
  for (const expected of ["Главное", "Питание", "Тело", "Фокус на неделю", "дней с записями"]) {
    if (!reviewText.includes(expected)) throw new Error(`В обзоре нет «${expected}»`);
  }
  if (!reviewText.includes("1600")) throw new Error("Среднее по ккал не совпало (ожидали 1600)");
  for (const forbidden of ["сорвал", "провалил", "компенсируйте", "сожгите"]) {
    if (reviewText.toLowerCase().includes(forbidden)) throw new Error(`Запрещённая формулировка «${forbidden}»`);
  }

  step("4. Предложение корректировки: вес не снижается → −150 ккал");
  if (!reviewText.includes("Предложение по плану")) throw new Error("Нет блока предложения");
  if (!reviewText.includes("уменьшить дневной диапазон на 150")) throw new Error("Ожидали предложение −150");
  const before = reviewText.match(/Сейчас: ~(\d+) ккал, вероятный диапазон (\d+)–(\d+)/);
  if (!before) throw new Error("Нет текущего ориентира и диапазона в предложении");

  step("5. Подтверждение корректировки");
  await page.click('button:has-text("Применить -150")');
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE}/app`);
  // Читаем именно подпись под калориями, а не текст всей страницы: соседние
  // блоки идут вплотную, и в склеенном тексте «из ~1440» и следующее за ним
  // число сливаются в «14400».
  const kcalCaption = await page.textContent(".day-totals div:first-child span");
  const after = kcalCaption.match(/из ~(\d+)/);
  if (!after) throw new Error(`Нет ориентира на главной: ${kcalCaption}`);
  const drop = Number(before[1]) - Number(after[1]);
  if (drop < 100 || drop > 200) throw new Error(`Ориентир должен снизиться на ~150: было ${before[1]}, стало ${after[1]}`);

  step("6. Корректировка сохранена в профиле");
  const adjustment = sql(`SELECT kcal_adjustment FROM profiles WHERE user_id = ${userId}`);
  if (adjustment !== "-150") throw new Error(`kcal_adjustment = ${adjustment}, ожидали -150`);

  console.log("E2E M4 OK");
} finally {
  await browser.close();
}

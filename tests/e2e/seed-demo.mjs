/**
 * Заполняет базу демонстрационными данными и снимает экраны продукта для
 * главной страницы.
 *
 *   node tests/e2e/seed-demo.mjs
 *
 * Требуется поднятое приложение (по умолчанию на 3160) и база, к которой оно
 * подключено. Готовые снимки кладутся в docs/screenshots, дальше их
 * обрезает и сжимает scripts/site-shots.mjs.
 *
 * ## Почему это лежит в репозитории
 *
 * Снимки на главной — настоящие экраны, а не макеты, и стареют вместе с
 * интерфейсом. Пересобрать их можно только тем же набором данных: другой
 * набор даст другие числа, другие метки состояния и другую высоту страницы,
 * то есть другой кадр. Скрипт и есть этот набор.
 */
import { execSync } from "node:child_process";
import { launchBrowser } from "./browser.mjs";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3160";
const OUT = process.env.SHOTS_DIR ?? "docs/screenshots";
const PASSWORD = "correct-horse-42";

const sql = (query) => execSync(
  `psql -h 127.0.0.1 -p 55432 -U jivoetelo -d jivoetelo -t -A -c "${query.replaceAll('"', '\\"')}"`,
  { encoding: "utf8" },
).trim();

/** psql печатает после RETURNING ещё и тег команды — берём только строку. */
const one = (query) => sql(query).split("\n")[0].trim();

/** Сегодня по таймзоне продукта, а не по таймзоне контейнера. */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
const dayBack = (back) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" })
  .format(new Date(Date.parse(`${today}T12:00:00Z`) - back * 86_400_000));

const stamp = Date.now();

// Обычный день обычного человека: четыре приёма, ничего показательного.
const MEALS = [
  ["08:15", "breakfast", "Овсянка с черникой и миндалём", [
    ["Овсяная каша на молоке", 220, 95, 3.2, 2.4, 14.8, 1.6],
    ["Черника", 60, 57, 0.7, 0.3, 12, 2.4],
    ["Миндаль", 15, 579, 21, 50, 22, 12.5],
  ]],
  ["13:20", "lunch", "Гречка, курица, салат", [
    ["Гречка отварная", 150, 110, 4.2, 1.1, 21.3, 3.7],
    ["Куриное бедро запечённое", 140, 185, 24, 9.5, 0, 0],
    ["Салат из огурцов и зелени", 120, 35, 1.1, 2.1, 3.2, 1.2],
  ]],
  ["16:40", "snack", "Творог с грушей", [
    ["Творог 5%", 150, 121, 17, 5, 3, 0],
    ["Груша", 130, 57, 0.4, 0.3, 13, 3.1],
  ]],
  ["19:10", "dinner", "Лосось с брокколи и киноа", [
    ["Лосось запечённый", 130, 208, 22, 13, 0, 0],
    ["Брокколи на пару", 180, 35, 2.8, 0.4, 4, 3.3],
    ["Киноа отварная", 90, 120, 4.4, 1.9, 21, 2.8],
  ]],
];

function seedDay(userId, day, list) {
  for (const [time, type, text, items] of list) {
    const mealId = one(
      `INSERT INTO meals (user_id, eaten_on, eaten_time, meal_type, source_text)
       VALUES (${userId}, '${day}', '${time}', '${type}', '${text}') RETURNING id`,
    );
    for (const [name, grams, kcal, p, f, c, fiber] of items) {
      sql(`INSERT INTO meal_items (meal_id, name, grams, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, fiber_per_100, confidence)
           VALUES (${mealId}, '${name}', ${grams}, ${kcal}, ${p}, ${f}, ${c}, ${fiber}, 'high')`);
    }
  }
}

async function register(page, email) {
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 20000 });
  return Number(sql(`SELECT id FROM users WHERE email = '${email}'`));
}

const browser = await launchBrowser();
try {
  // ── Кабинет пользователя ────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 })).newPage();
  const userId = await register(page, `demo-marina-${stamp}@example.com`);
  sql(`INSERT INTO profiles (user_id, goal, sex_for_formula, birth_year, height_cm, activity, pace, target_weight_kg)
       VALUES (${userId}, 'lose', 'female', 1990, 168, 'moderate', 'gentle', 63)`);
  for (const [back, kg] of [[28, 71.4], [21, 70.8], [14, 70.1], [7, 69.4], [0, 68.6]]) {
    sql(`INSERT INTO weight_entries (user_id, on_date, weight_kg) VALUES (${userId}, '${dayBack(back)}', ${kg})`);
  }
  seedDay(userId, today, MEALS);

  await page.goto(`${BASE}/app`);
  await page.waitForSelector(".day-summary", { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/site-cabinet.png`, fullPage: true });
  console.log(`  ok   ${OUT}/site-cabinet.png`);

  // ── Кабинет специалиста ─────────────────────────────────────────────────
  const proPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  const proId = await register(proPage, `demo-irina-${stamp}@example.com`);
  sql(`INSERT INTO specialists (user_id, display_name, specialization, city, status, approved_at)
       VALUES (${proId}, 'Ирина Соколова', 'нутрициолог', 'Краснодар', 'approved', now())`);

  // Список сортируется по дате принятия, свежие сверху, — поэтому вставляем в
  // обратном порядке. Последнее число — за сколько из семи дней есть записи:
  // от него зависит метка состояния, и три клиента подобраны так, чтобы на
  // экране были видны все три.
  const clients = [
    ["Виктория Т.", false, false, false, 0],
    ["Марина С.", true, false, true, 2],
    ["Алина Н.", true, true, false, 6],
  ];
  let index = 0;
  for (const [name, summary, diary, weight, activeDays] of clients) {
    const clientId = one(`INSERT INTO users (email) VALUES ('demo-client-${stamp}-${index++}@example.com') RETURNING id`);
    sql(`INSERT INTO specialist_clients (specialist_user_id, client_user_id, share_summary, share_diary, share_weight, client_name)
         VALUES (${proId}, ${clientId}, ${summary}, ${diary}, ${weight}, '${name}')`);
    for (let back = 0; back < activeDays; back++) seedDay(clientId, dayBack(back), MEALS.slice(0, 2));
  }

  await proPage.goto(`${BASE}/pro/clients`);
  await proPage.waitForSelector(".pro-cab-list", { timeout: 15000 });
  await proPage.screenshot({ path: `${OUT}/site-pro.png`, fullPage: true });
  console.log(`  ok   ${OUT}/site-pro.png`);
  console.log("Дальше: node scripts/site-shots.mjs");
} finally {
  await browser.close();
}

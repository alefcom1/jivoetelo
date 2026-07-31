import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LEGAL_VERSION } from "../../lib/legal.ts";
import { launchBrowser } from "./browser.mjs";

// Сквозная проверка юридического блока: документы, согласия, выгрузка и
// удаление аккаунта. Всё, что обещано в /legal/privacy разделом «Ваши права»,
// должно работать не на словах.

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3111";
const UPLOADS = process.env.UPLOADS_DIR ?? path.resolve("data/uploads");
const stamp = Date.now();
const email = `e2e-legal-${stamp}@example.com`;
const password = "correct-horse-42";

function step(name) { console.log(`--- ${name}`); }

function sql(query) {
  return execSync(
    `psql -h 127.0.0.1 -p 55432 -U jivoetelo -d jivoetelo -t -A -c "${query.replaceAll('"', '\\"')}"`,
    { encoding: "utf8" },
  ).trim();
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage();

  step("1. Все документы открываются и говорят по существу");
  const documents = [
    ["/legal", "Договорённости"],
    ["/legal/terms", "не медицинское изделие"],
    ["/legal/privacy", "152-ФЗ"],
    ["/legal/consent", "трансграничную передачу"],
    ["/legal/health", "дозы инсулина"],
    ["/legal/cookies", "jt_session"],
  ];
  for (const [href, expected] of documents) {
    const response = await page.goto(`${BASE}${href}`);
    if (response.status() !== 200) throw new Error(`${href} отдал ${response.status()}`);
    const text = await page.textContent("body");
    if (!text.includes(expected)) throw new Error(`${href} не содержит «${expected}»`);
  }

  step("2. Пока реквизиты не заполнены, документы не выдумывают ИНН");
  await page.goto(`${BASE}/legal/privacy`);
  const privacyText = await page.textContent("body");
  if (!privacyText.includes("будет указано после регистрации")) {
    throw new Error("Ожидали честную пометку о незаполненных реквизитах");
  }

  // Шаги про лист ожидания убраны вместе с самой формой: продукт открыт, и
  // главная больше не зовёт в закрытый запуск. Проверка «без согласия ничего
  // не сохраняется» никуда не делась — она ниже, на регистрации, где сейчас
  // и собираются согласия.

  step("3. Регистрация без согласий отклоняется на сервере");
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.evaluate(() => {
    for (const name of ["consent_terms", "consent_ai"]) {
      document.querySelector(`input[name="${name}"]`).removeAttribute("required");
    }
  });
  await page.click('button[type="submit"]');
  await page.waitForSelector(".form-error");
  const registerError = await page.textContent(".form-error");
  if (!registerError.includes("согласи")) throw new Error(`Непонятная ошибка: ${registerError}`);
  if (sql(`SELECT count(*) FROM users WHERE email = '${email}'`) !== "0") {
    throw new Error("Аккаунт создан без согласий");
  }

  step("4. Адрес после ошибки не потерялся, пароль — вводится заново");
  if ((await page.inputValue('input[name="email"]')) !== email) {
    throw new Error("После ошибки форма потеряла введённый адрес");
  }
  if ((await page.inputValue('input[name="password"]')) !== "") {
    throw new Error("Пароль не должен возвращаться с сервера");
  }

  step("5. С согласиями аккаунт создаётся, согласия фиксируются");
  await page.fill('input[name="password"]', password);
  await page.check('input[name="consent_terms"]');
  await page.check('input[name="consent_ai"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app", { timeout: 15000 });
  const userId = sql(`SELECT id FROM users WHERE email = '${email}'`);
  const kinds = sql(`SELECT kind FROM user_consents WHERE user_id = ${userId} ORDER BY kind`).split("\n");
  if (kinds.join(",") !== "ai_processing,terms") throw new Error(`Записаны согласия: ${kinds}`);
  // Редакция сверяется с константой, а не с соседней записью: по 152-ФЗ
  // оператор обязан показать, под какой именно версией стоит подпись, —
  // значит в базе должна оказаться сегодняшняя, а не «какая-то одна».
  const versions = sql(`SELECT DISTINCT version FROM user_consents WHERE user_id = ${userId}`);
  if (versions !== LEGAL_VERSION) throw new Error(`Записана редакция ${versions}, а документы — ${LEGAL_VERSION}`);

  step("6. В настройках видно, на что человек согласился");
  await page.goto(`${BASE}/app/settings`);
  const settingsText = await page.textContent(".settings");
  if (!settingsText.includes("Пользовательское соглашение и Политика")) {
    throw new Error("Настройки не показывают принятые согласия");
  }
  if (!settingsText.includes("Скачать мои данные")) throw new Error("Нет кнопки выгрузки");

  step("7. Подкладываем приём пищи с фотографией");
  const photoKey = `${userId}/e2e-legal.jpg`;
  const photoPath = path.join(UPLOADS, photoKey);
  mkdirSync(path.dirname(photoPath), { recursive: true });
  writeFileSync(photoPath, Buffer.from("fake-jpeg-bytes"));
  sql(`INSERT INTO meals (user_id, eaten_on, eaten_time, meal_type, source_text, photo_key)
       VALUES (${userId}, CURRENT_DATE, '13:20', 'lunch', 'Тестовый обед', '${photoKey}')`);
  const mealId = sql(`SELECT id FROM meals WHERE user_id = ${userId}`);
  sql(`INSERT INTO meal_items (meal_id, name, grams, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, fiber_per_100, confidence)
       VALUES (${mealId}, 'Гречка', 200, 110, 4.2, 1.1, 21.3, 3.7, 'high')`);

  step("8. Выгрузка отдаёт всё и не отдаёт лишнего");
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const exportResponse = await fetch(`${BASE}/api/account/export`, { headers: { cookie: cookieHeader } });
  if (exportResponse.status !== 200) throw new Error(`Выгрузка: ${exportResponse.status}`);
  const disposition = exportResponse.headers.get("content-disposition") ?? "";
  if (!disposition.startsWith("attachment;")) throw new Error(`Не файл: ${disposition}`);
  if (exportResponse.headers.get("cache-control") !== "no-store") throw new Error("Выгрузка кэшируется");
  const raw = await exportResponse.text();
  const data = JSON.parse(raw);
  for (const key of ["аккаунт", "согласия", "приёмы_пищи", "вес", "обращения_к_ai", "лист_ожидания"]) {
    if (!(key in data)) throw new Error(`В выгрузке нет раздела «${key}»`);
  }
  if (data.аккаунт.email !== email) throw new Error("В выгрузке чужой аккаунт");
  if (data.согласия.length !== 2) throw new Error(`Согласий в выгрузке: ${data.согласия.length}`);
  if (data.приёмы_пищи.length !== 1 || data.приёмы_пищи[0].состав.length !== 1) {
    throw new Error("Приём пищи выгрузился без состава");
  }
  if (raw.includes("passwordHash") || raw.includes("password_hash")) {
    throw new Error("В выгрузке оказался хеш пароля");
  }

  step("9. Выгрузка недоступна без сессии");
  const anonymous = await fetch(`${BASE}/api/account/export`);
  if (anonymous.status !== 401) throw new Error(`Аноним получил ${anonymous.status}`);

  step("10. Удаление требует явного подтверждения");
  await page.goto(`${BASE}/app/settings`);
  await page.click('button:has-text("Удалить аккаунт")');
  await page.fill('input[name="confirmation"]', "удалить пожалуйста");
  await page.click('button:has-text("Удалить аккаунт навсегда")');
  await page.waitForSelector(".danger-zone .form-error");
  if (sql(`SELECT count(*) FROM users WHERE id = ${userId}`) !== "1") {
    throw new Error("Аккаунт удалён без подтверждения");
  }

  step("11. Правильное подтверждение стирает всё");
  await page.fill('input[name="confirmation"]', "УДАЛИТЬ");
  await page.click('button:has-text("Удалить аккаунт навсегда")');
  await page.waitForURL("**/?deleted=1", { timeout: 15000 });

  for (const [table, condition] of [
    ["users", `id = ${userId}`],
    ["meals", `user_id = ${userId}`],
    ["meal_items", `meal_id = ${mealId}`],
    ["user_consents", `user_id = ${userId}`],
    ["sessions", `user_id = ${userId}`],
  ]) {
    const left = sql(`SELECT count(*) FROM ${table} WHERE ${condition}`);
    if (left !== "0") throw new Error(`В ${table} осталось строк: ${left}`);
  }
  if (existsSync(photoPath)) throw new Error("Фотография осталась на диске после удаления аккаунта");

  step("12. После удаления доступ закрыт");
  await page.goto(`${BASE}/app`);
  await page.waitForURL("**/login", { timeout: 15000 });

  console.log("\nE2E legal OK");
} finally {
  await browser.close();
}

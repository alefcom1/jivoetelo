/**
 * Почтовая серия: от формы под калькулятором до отписки.
 *
 * Отправку писем здесь не проверяем — без SMTP mailer печатает в лог, и это
 * покрыто tests/e2e/scheduler.mjs. Здесь важно другое: доходят ли до базы те
 * самые числа, которые человек увидел на экране, и работает ли отписка так,
 * как обещано в письме.
 *
 * Запуск: сервер на 3111, Postgres с миграциями.
 */

import { execFileSync } from "node:child_process";
import { launchBrowser } from "./browser.mjs";

const BASE = "http://127.0.0.1:3111";
const PSQL = ["-h", "127.0.0.1", "-p", process.env.PGPORT ?? "5433", "-U", "postgres", "-d", "jivoetelo", "-t", "-A"];
const email = `e2e-series-${Date.now()}@example.com`;

function sql(query) {
  return execFileSync("psql", [...PSQL, "-c", query], { encoding: "utf8" }).trim().split("\n")[0].trim();
}

const step = (name) => console.log(`--- ${name}`);

const browser = await launchBrowser();
try {
  const page = await browser.newPage();

  step("1. Форма подписки есть сразу под результатом расчёта");
  await page.goto(`${BASE}/raschet/energiya`);
  await page.waitForSelector(".raschet-capture");

  step("2. Меняем вес — числа в скрытых полях едут следом за экраном");
  await page.fill('input[type="number"][step="0.1"]', "72");
  await page.waitForFunction(() => document.querySelector('input[name="kcalTarget"]')?.value !== "1870");

  const shown = await page.textContent(".raschet-range");
  const hidden = await page.evaluate(() =>
    Object.fromEntries(
      ["kcalTarget", "kcalMin", "kcalMax", "proteinTarget"].map((name) => [
        name,
        Number(document.querySelector(`input[name="${name}"]`).value),
      ]),
    ));
  if (!shown.startsWith(String(hidden.kcalTarget))) {
    throw new Error(`На экране ${shown}, в форме ${hidden.kcalTarget}`);
  }

  step("3. Подписка");
  await page.fill('.raschet-capture input[type="email"]', email);
  await page.check('.raschet-capture input[name="consent"]');
  await page.click('.raschet-capture button[type="submit"]');
  await page.waitForSelector(".raschet-capture-done", { timeout: 15000 });
  const doneText = await page.textContent(".raschet-capture-done");
  if (!doneText.includes("Письмо в пути")) throw new Error(`Неожиданный текст: ${doneText}`);

  step("4. В базе один подписчик, три письма и те же числа");
  const row = sql(
    `SELECT id || '|' || source || '|' || consent_version || '|' || (context->>'kcalTarget')
       || '|' || (context->>'proteinTarget') FROM email_subscribers WHERE email = '${email}'`,
  );
  const [subscriberId, source, consentVersion, storedKcal, storedProtein] = row.split("|");
  if (source !== "raschet_energiya") throw new Error(`Не тот источник: ${source}`);
  if (!consentVersion) throw new Error("Не записана редакция документов, на которую дано согласие");
  if (Number(storedKcal) !== hidden.kcalTarget) throw new Error(`ккал: экран ${hidden.kcalTarget}, база ${storedKcal}`);
  if (Number(storedProtein) !== hidden.proteinTarget) throw new Error(`белок: экран ${hidden.proteinTarget}, база ${storedProtein}`);

  const letters = sql(`SELECT count(*) FROM email_deliveries WHERE subscriber_id = ${subscriberId}`);
  if (letters !== "3") throw new Error(`Ожидали три письма, получили ${letters}`);

  step("5. Повторная подписка тем же адресом не удваивает серию");
  await page.goto(`${BASE}/raschet/energiya`);
  await page.waitForSelector(".raschet-capture");
  await page.fill('.raschet-capture input[type="email"]', email);
  await page.check('.raschet-capture input[name="consent"]');
  await page.click('.raschet-capture button[type="submit"]');
  await page.waitForSelector(".raschet-capture-done", { timeout: 15000 });
  if (sql(`SELECT count(*) FROM email_subscribers WHERE email = '${email}'`) !== "1") {
    throw new Error("Появился второй подписчик с тем же адресом");
  }
  if (sql(`SELECT count(*) FROM email_deliveries WHERE subscriber_id = ${subscriberId}`) !== "3") {
    throw new Error("Серия удвоилась");
  }

  step("6. Страница отписки не отписывает сама по себе");
  const token = sql(`SELECT unsubscribe_token FROM email_subscribers WHERE id = ${subscriberId}`);
  await page.goto(`${BASE}/pochta/otpiska?token=${encodeURIComponent(token)}`);
  await page.waitForSelector('button:has-text("Отписаться")');
  if (sql(`SELECT (unsubscribed_at IS NULL)::text FROM email_subscribers WHERE id = ${subscriberId}`) !== "true") {
    throw new Error("Отписка сработала от одного открытия страницы");
  }

  step("7. Кнопка отписывает и убирает неотправленные письма");
  await page.click('button:has-text("Отписаться")');
  await page.waitForSelector("text=Больше писем этой серии не будет", { timeout: 15000 });
  if (sql(`SELECT (unsubscribed_at IS NOT NULL)::text FROM email_subscribers WHERE id = ${subscriberId}`) !== "true") {
    throw new Error("Отписка не записана");
  }
  if (sql(`SELECT count(*) FROM email_deliveries WHERE subscriber_id = ${subscriberId}`) !== "0") {
    throw new Error("Неотправленные письма остались в очереди");
  }

  step("8. Ссылка без метки объясняет, что делать");
  await page.goto(`${BASE}/pochta/otpiska`);
  const noToken = await page.textContent(".legal-doc");
  if (!noToken.includes("нет метки")) throw new Error(`Неожиданный текст: ${noToken.slice(0, 200)}`);

  step("9. Отписка в один клик из почтового клиента");
  const second = `e2e-oneclick-${Date.now()}@example.com`;
  await page.goto(`${BASE}/raschet/energiya`);
  await page.waitForSelector(".raschet-capture");
  await page.fill('.raschet-capture input[type="email"]', second);
  await page.check('.raschet-capture input[name="consent"]');
  await page.click('.raschet-capture button[type="submit"]');
  await page.waitForSelector(".raschet-capture-done", { timeout: 15000 });

  const secondToken = sql(`SELECT unsubscribe_token FROM email_subscribers WHERE email = '${second}'`);
  const status = await page.evaluate(
    async (url) => (await fetch(url, { method: "POST" })).status,
    `/api/email/unsubscribe?token=${encodeURIComponent(secondToken)}`,
  );
  if (status !== 200) throw new Error(`One-click вернул ${status}`);
  if (sql(`SELECT (unsubscribed_at IS NOT NULL)::text FROM email_subscribers WHERE email = '${second}'`) !== "true") {
    throw new Error("One-click не отписал");
  }

  console.log("\nПочтовая серия: все проверки пройдены.");
} finally {
  await browser.close();
}

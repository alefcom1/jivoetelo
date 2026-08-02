/**
 * Интеграционная проверка отчётов на настоящем Postgres.
 *
 * Юнит-тесты покрывают содержание и выбор канала; здесь проверяется то, что
 * проверяется только на базе: отбор кандидатов запросом, идемпотентность через
 * уникальный индекс, захват строки на отправку и поведение при повторном
 * заходе планировщика.
 *
 * Скрипт распоряжается таблицами отчётов единолично и в начале их чистит.
 * Запускать только на тестовой базе.
 *
 * Запуск (база с применёнными миграциями):
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:5432/jt_e2e \
 *     node --import ./tests/e2e/alias-hook.mjs tests/e2e/reports.mjs
 */

import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { mealItems, meals, reportDeliveries, reportPreferences, users } from "../../db/schema.ts";
import { localMoment } from "../../lib/dates.ts";
import { dispatchDueReports, enqueueDueReports } from "../../lib/report-dispatch.ts";
import { previousWeek } from "../../lib/report-period.ts";
import { unsubscribeReportsByToken } from "../../lib/report-unsubscribe.ts";

if (!process.env.DATABASE_URL) {
  console.error("Нужен DATABASE_URL");
  process.exit(1);
}
// Отправлять по-настоящему нечем и незачем: mailer без SMTP печатает в лог,
// а бот без токена честно отвечает «не отправлено».
delete process.env.SMTP_HOST;
delete process.env.TELEGRAM_BOT_TOKEN;

const db = getDb();
const step = (name) => console.log(`--- ${name}`);

await db.execute(sql`DELETE FROM report_deliveries`);
await db.execute(sql`DELETE FROM report_preferences`);

const stamp = Date.now();

/**
 * Момент внутри окна отправки. Планировщик смотрит на местный час, и в
 * зависимости от того, когда запущен тест, «сейчас» может быть ночью — тогда
 * enqueueDueReports честно ничего не сделает, и проверять станет нечего.
 */
function atSendHour(day, hour = 12) {
  for (let shift = 0; shift < 48; shift += 1) {
    const at = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
    const moment = localMoment(new Date(at.getTime() - shift * 3600_000));
    if (moment.day === day && moment.hour >= 10 && moment.hour < 21) {
      return new Date(at.getTime() - shift * 3600_000);
    }
  }
  throw new Error("не нашёл час внутри окна отправки");
}

// Понедельник: отчёт за 16–22 марта.
const MONDAY = "2026-03-23";
const period = previousWeek(MONDAY);
const now = atSendHour(MONDAY);
assert.equal(localMoment(now).day, MONDAY, "момент должен приходиться на понедельник по местному времени");

async function makeUser({ email, telegram, days }) {
  const [user] = await db
    .insert(users)
    .values({ email, telegramUserId: telegram })
    .returning({ id: users.id });
  for (const day of days) {
    const [meal] = await db
      .insert(meals)
      .values({ userId: user.id, eatenOn: day, eatenTime: "13:00", mealType: "lunch" })
      .returning({ id: meals.id });
    await db.insert(mealItems).values({
      mealId: meal.id,
      name: "Обед",
      grams: 400,
      kcalPer100: 120,
      proteinPer100: 8,
      fatPer100: 4,
      carbsPer100: 14,
      fiberPer100: 3,
      confidence: "high",
    });
  }
  return user.id;
}

const week = ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"];

step("кандидаты отбираются по числу дней с записями");
const active = await makeUser({ email: `active-${stamp}@example.com`, telegram: `tg-${stamp}-1`, days: week });
const thin = await makeUser({ email: `thin-${stamp}@example.com`, telegram: null, days: week.slice(0, 2) });
const silent = await makeUser({ email: `silent-${stamp}@example.com`, telegram: null, days: [] });

const queued = await enqueueDueReports(now);
assert.ok(queued >= 1, `ожидали хотя бы одну постановку в очередь, получили ${queued}`);

const rowsFor = async (userId) =>
  db.select().from(reportDeliveries).where(eq(reportDeliveries.userId, userId));

assert.equal((await rowsFor(active)).length, 1, "у активного — ровно одна строка");
assert.equal((await rowsFor(thin)).length, 0, "два дня — ниже порога, отчёта быть не должно");
assert.equal((await rowsFor(silent)).length, 0, "без записей отчёт не ставится в очередь");

step("канал по умолчанию: Telegram есть — значит Telegram");
const activeRow = (await rowsFor(active))[0];
assert.equal(activeRow.channel, "telegram");
assert.equal(activeRow.kind, "weekly");
assert.equal(String(activeRow.periodEnd), period.to);

step("повторный заход не создаёт вторую строку");
await enqueueDueReports(now);
assert.equal((await rowsFor(active)).length, 1, "уникальный индекс обязан удержать дубль");

step("без Telegram «авто» уходит на почту");
const byMail = await makeUser({ email: `mail-${stamp}@example.com`, telegram: null, days: week });
await enqueueDueReports(now);
assert.equal((await rowsFor(byMail))[0].channel, "email");

step("выключенные отчёты не ставятся в очередь вовсе");
const off = await makeUser({ email: `off-${stamp}@example.com`, telegram: null, days: week });
await db.insert(reportPreferences).values({ userId: off, weekly: "off", monthly: "off" });
await enqueueDueReports(now);
assert.equal((await rowsFor(off)).length, 0);

step("отправка: почта уходит, Telegram без токена — нет");
const result = await dispatchDueReports(now);
assert.ok(result.sent >= 1, `ожидали хотя бы одну успешную отправку, получили ${JSON.stringify(result)}`);

const mailRow = (await rowsFor(byMail))[0];
assert.ok(mailRow.sentAt, "письмо должно быть помечено отправленным");
assert.equal(mailRow.attempts, 1);

const tgRow = (await rowsFor(active))[0];
assert.equal(tgRow.sentAt, null, "без токена бот отправить не мог");
assert.match(tgRow.lastError ?? "", /не принял/);

step("письмо унесло с собой токен отписки в один клик");
const [prefsRow] = await db.select().from(reportPreferences).where(eq(reportPreferences.userId, byMail));
assert.ok(prefsRow?.unsubscribeToken, "без токена почтовый клиент не нарисует кнопку «Отписаться»");
// Настройки при этом остались по умолчанию: строка заведена ради токена, а не
// вместо выбора человека.
assert.equal(prefsRow.weekly, "auto");
assert.equal(prefsRow.monthly, "auto");

assert.equal(await unsubscribeReportsByToken(prefsRow.unsubscribeToken), true);
const afterUnsub = (await db.select().from(reportPreferences).where(eq(reportPreferences.userId, byMail)))[0];
assert.equal(afterUnsub.weekly, "off");
assert.equal(afterUnsub.monthly, "off");
assert.equal(await unsubscribeReportsByToken("чужой-токен"), false);

step("повторный заход не отправляет уже отправленное");
const second = await dispatchDueReports(now);
assert.equal(second.sent, 0, "письмо не должно уйти дважды");

step("неудачная отправка повторяется не раньше, чем через 15 минут");
// Захват стоит на строке, и следующий заход в ту же минуту её не трогает —
// иначе неудачная отправка крутилась бы каждые 60 секунд.
await dispatchDueReports(now);
assert.equal((await rowsFor(active))[0].attempts, 1, "повтор в ту же минуту недопустим");

step("после пяти неудач попытки прекращаются");
for (let i = 1; i <= 6; i += 1) {
  await dispatchDueReports(new Date(now.getTime() + i * 20 * 60_000));
}
const exhausted = (await rowsFor(active))[0];
assert.equal(exhausted.attempts, 5, `остановиться должны ровно на пяти, получили ${exhausted.attempts}`);
assert.equal(exhausted.sentAt, null);

step("настройка, изменённая после постановки в очередь, отменяет отправку");
const late = await makeUser({ email: `late-${stamp}@example.com`, telegram: null, days: week });
await enqueueDueReports(now);
assert.equal((await rowsFor(late)).length, 1);
await db.insert(reportPreferences).values({ userId: late, weekly: "off" });
await dispatchDueReports(now);
const skipped = (await rowsFor(late))[0];
assert.ok(skipped.sentAt, "строка должна закрыться, чтобы не всплывать каждую минуту");
assert.match(skipped.lastError ?? "", /пропущено/);

step("вне окна отправки планировщик молчит");
const night = new Date(`${MONDAY}T01:00:00Z`);
const nightMoment = localMoment(night);
if (nightMoment.hour < 10 || nightMoment.hour >= 21) {
  assert.equal(await enqueueDueReports(night), 0);
} else {
  console.log("    (пропущено: в этой таймзоне 01:00 UTC попадает в окно отправки)");
}

step("уборка");
for (const id of [active, thin, silent, byMail, off, late]) {
  await db.delete(users).where(eq(users.id, id));
}

console.log("\nОтчёты: все проверки прошли.");
process.exit(0);

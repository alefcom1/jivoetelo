/**
 * Интеграционная проверка планировщика на настоящем Postgres. Юнит-тесты
 * покрывают правила («писать ли сейчас», «какой текст»), а здесь проверяется
 * то, что можно проверить только на базе: захват строк, идемпотентность и
 * поведение при повторном заходе.
 *
 * Скрипт распоряжается почтовыми таблицами единолично: он двигает время
 * вперёд, а `dispatchDueEmails` смотрит на всю базу сразу — чужой подписчик с
 * наступившим сроком сбил бы счётчики. Поэтому в начале таблицы очищаются.
 * Запускать только на тестовой базе.
 *
 * Запуск (база с применёнными миграциями):
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:5433/jivoetelo \
 *     node --import ./tests/e2e/alias-hook.mjs tests/e2e/scheduler.mjs
 */

import assert from "node:assert/strict";
import { getDb } from "../../db/index.ts";
import { emailDeliveries, emailSubscribers, users } from "../../db/schema.ts";
import { eq, sql } from "drizzle-orm";
import { subscribeToSeries, unsubscribeByToken } from "../../lib/email-subscribe.ts";
import { dispatchDueEmails, dispatchDueReminders } from "../../lib/scheduler.ts";
import { addToInbox, countPendingOnDay, dismissItem, listPending } from "../../lib/inbox.ts";
import { localMoment } from "../../lib/dates.ts";

if (!process.env.DATABASE_URL) {
  console.error("Нужен DATABASE_URL");
  process.exit(1);
}
// Отправлять по-настоящему нечем и незачем: mailer без SMTP печатает в лог.
delete process.env.SMTP_HOST;

const db = getDb();
const step = (name) => console.log(`--- ${name}`);
const stamp = Date.now();

// Каскад по внешнему ключу заодно уносит и строки доставки.
await db.execute(sql`DELETE FROM email_subscribers`);

step("подписка создаёт три письма со сроками 0 / 2 / 5 дней");
const now = new Date();
const email = `scheduler-${stamp}@example.com`;
const context = { kcalTarget: 1870, kcalMin: 1740, kcalMax: 2000, proteinTarget: 96 };
assert.equal(await subscribeToSeries({ email, source: "raschet_energiya", consentVersion: "1.0", context, now }), "subscribed");

const [subscriber] = await db.select().from(emailSubscribers).where(eq(emailSubscribers.email, email));
assert.ok(subscriber.unsubscribeToken.length > 20, "токен отписки должен быть длинным");

let deliveries = await db.select().from(emailDeliveries).where(eq(emailDeliveries.subscriberId, subscriber.id));
assert.equal(deliveries.length, 3);
const byLetter = Object.fromEntries(deliveries.map((d) => [d.letter, d]));
assert.equal(byLetter[1].scheduledFor.getTime(), now.getTime(), "первое письмо уходит сразу");
assert.ok(byLetter[2].scheduledFor > byLetter[1].scheduledFor);
assert.ok(byLetter[3].scheduledFor > byLetter[2].scheduledFor);
for (const letter of [2, 3]) {
  const hour = localMoment(byLetter[letter].scheduledFor).hour;
  assert.ok(hour >= 10 && hour < 20, `письмо ${letter} назначено на ${hour} ч — вне дневного окна`);
}

step("повторная подписка активного адреса не создаёт вторую серию");
assert.equal(await subscribeToSeries({ email, source: "raschet_energiya", consentVersion: "1.0", context, now }), "already");
deliveries = await db.select().from(emailDeliveries).where(eq(emailDeliveries.subscriberId, subscriber.id));
assert.equal(deliveries.length, 3);

step("первый заход отправляет только первое письмо");
let result = await dispatchDueEmails(new Date());
assert.deepEqual(result, { sent: 1, failed: 0 });

step("второй заход не отправляет ничего повторно");
result = await dispatchDueEmails(new Date());
assert.deepEqual(result, { sent: 0, failed: 0 });

const sentRows = await db
  .select()
  .from(emailDeliveries)
  .where(eq(emailDeliveries.subscriberId, subscriber.id));
assert.equal(sentRows.filter((r) => r.sentAt !== null).length, 1);
assert.equal(sentRows.find((r) => r.letter === 1).attempts, 1, "успешное письмо не должно перезахватываться");

step("наступивший срок второго письма отправляет ровно одно");
const future = new Date(byLetter[2].scheduledFor.getTime() + 1000);
result = await dispatchDueEmails(future);
assert.deepEqual(result, { sent: 1, failed: 0 });

step("отписка удаляет неотправленные письма и не трогает отправленные");
assert.equal(await unsubscribeByToken(subscriber.unsubscribeToken), true);
const afterUnsub = await db.select().from(emailDeliveries).where(eq(emailDeliveries.subscriberId, subscriber.id));
assert.equal(afterUnsub.length, 2, "третье письмо должно исчезнуть, два отправленных — остаться");
assert.ok(afterUnsub.every((r) => r.sentAt !== null));

step("повторная отписка идемпотентна и не переписывает дату отзыва");
const [afterFirst] = await db.select().from(emailSubscribers).where(eq(emailSubscribers.id, subscriber.id));
await new Promise((r) => setTimeout(r, 20));
assert.equal(await unsubscribeByToken(subscriber.unsubscribeToken), true);
const [afterSecond] = await db.select().from(emailSubscribers).where(eq(emailSubscribers.id, subscriber.id));
assert.equal(afterSecond.unsubscribedAt.getTime(), afterFirst.unsubscribedAt.getTime());

step("неизвестный токен отписки честно возвращает false");
assert.equal(await unsubscribeByToken("нет-такого-токена"), false);

step("отписавшемуся письма больше не уходят даже по сроку");
result = await dispatchDueEmails(new Date(byLetter[3].scheduledFor.getTime() + 1000));
assert.deepEqual(result, { sent: 0, failed: 0 });

step("подписка после отписки начинает серию заново");
assert.equal(await subscribeToSeries({ email, source: "raschet_energiya", consentVersion: "1.0", context, now: new Date() }), "subscribed");
const restarted = await db.select().from(emailDeliveries).where(eq(emailDeliveries.subscriberId, subscriber.id));
assert.equal(restarted.length, 3, "старые строки заменяются новой серией");
assert.ok(restarted.every((r) => r.sentAt === null));

step("битый контекст не роняет заход и больше не повторяется");
await db.update(emailSubscribers).set({ context: { kcalTarget: "ерунда" } }).where(eq(emailSubscribers.id, subscriber.id));
result = await dispatchDueEmails(new Date());
assert.deepEqual(result, { sent: 0, failed: 1 });
const broken = await db
  .select()
  .from(emailDeliveries)
  .where(eq(emailDeliveries.subscriberId, subscriber.id));
const firstLetter = broken.find((r) => r.letter === 1);
assert.equal(firstLetter.attempts, 5, "исчерпанные попытки останавливают повтор");
assert.match(firstLetter.lastError, /контекст/);
result = await dispatchDueEmails(new Date());
assert.equal(result.failed, 0, "исчерпанная строка не берётся снова");

step("фото-инбокс: добавление, подсчёт и отклонение");
const [user] = await db
  .insert(users)
  .values({ email: `inbox-${stamp}@example.com`, passwordHash: "x", telegramUserId: `tg-${stamp}` })
  .returning({ id: users.id });

const today = localMoment(new Date()).day;
const firstId = await addToInbox({ userId: user.id, photoKey: `${user.id}/a.jpg`, note: "омлет", takenOn: today, takenTime: "09:12" });
await addToInbox({ userId: user.id, photoKey: `${user.id}/b.jpg`, note: null, takenOn: today, takenTime: "13:40" });
assert.equal(await countPendingOnDay(user.id, today), 2);

const pending = await listPending(user.id);
assert.equal(pending.length, 2);
assert.equal(pending[0].takenTime, "13:40", "новые снимки должны быть сверху");

assert.equal(await dismissItem(user.id, firstId), true);
assert.equal(await countPendingOnDay(user.id, today), 1);
assert.equal(await dismissItem(user.id, firstId), false, "повторное отклонение ничего не меняет");

step("чужой снимок не отклоняется");
const [stranger] = await db
  .insert(users)
  .values({ email: `stranger-${stamp}@example.com`, passwordHash: "x" })
  .returning({ id: users.id });
assert.equal(await dismissItem(stranger.id, pending[0].id), false);
assert.equal(await countPendingOnDay(user.id, today), 1, "снимок должен остаться у владельца");

step("напоминания: без токена бота планировщик молчит");
delete process.env.TELEGRAM_BOT_TOKEN;
assert.deepEqual(await dispatchDueReminders(new Date()), { sent: 0, failed: 0 });

step("напоминания: захват дня происходит один раз");
process.env.TELEGRAM_BOT_TOKEN = "123456:TEST";
// Момент внутри разрешённых часов и после часа дайджеста по умолчанию.
const evening = new Date(`${today}T18:30:00Z`); // 21:30 в Москве

// Планировщик смотрит на всю базу сразу, а другие e2e-наборы оставляют после
// себя привязанные Telegram-аккаунты. Гасим их на сегодня, чтобы счётчики
// относились ровно к нашему пользователю.
await db.execute(sql`
  INSERT INTO bot_preferences (user_id, last_reminder_on)
  SELECT id, ${today} FROM users WHERE telegram_user_id IS NOT NULL AND id <> ${user.id}
  ON CONFLICT (user_id) DO UPDATE SET last_reminder_on = ${today}
`);

const first = await dispatchDueReminders(evening);
const claimed = await db.execute(sql`SELECT last_reminder_on FROM bot_preferences WHERE user_id = ${user.id}`);
assert.equal(claimed.rows.length, 1, "день должен быть захвачен");
// Отправка наружу в тесте невозможна, поэтому считаем только неудачи.
assert.equal(first.sent + first.failed, 1);

const second = await dispatchDueReminders(evening);
assert.deepEqual(second, { sent: 0, failed: 0 }, "второй заход в тот же день молчит");

step("напоминания: ночью запрос к базе не делается");
assert.deepEqual(await dispatchDueReminders(new Date(`${today}T00:30:00Z`)), { sent: 0, failed: 0 });

console.log("\nВсе проверки планировщика пройдены.");
process.exit(0);

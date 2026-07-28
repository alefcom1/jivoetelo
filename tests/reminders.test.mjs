import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIGEST_HOUR,
  GENTLE_NUDGE_TEXT,
  MAX_DIGEST_HOUR,
  MIN_DIGEST_HOUR,
  normalizeDigestHour,
  photoDigestText,
  planReminder,
  snoozeUntil,
} from "../lib/reminders.ts";

const NOW = new Date("2026-07-28T17:05:00Z");

/** Вечер, есть одно неразобранное фото, сегодня бот ещё не писал. */
function context(overrides = {}) {
  return {
    now: NOW,
    localDay: "2026-07-28",
    localHour: 20,
    remindersEnabled: true,
    digestHour: 20,
    snoozedUntil: null,
    lastReminderOn: null,
    pendingPhotosToday: 1,
    mealsToday: 0,
    ...overrides,
  };
}

test("вечером с неразобранными фото приходит дайджест", () => {
  const plan = planReminder(context());
  assert.equal(plan?.kind, "photo_digest");
  assert.match(plan.text, /1 фото ждёт разбора/);
});

test("выключенные напоминания молчат при любых условиях", () => {
  assert.equal(planReminder(context({ remindersEnabled: false })), null);
});

test("пауза молчит до своего срока и снова пишет после", () => {
  const until = new Date(NOW.getTime() + 60_000);
  assert.equal(planReminder(context({ snoozedUntil: until })), null);

  const past = new Date(NOW.getTime() - 60_000);
  assert.equal(planReminder(context({ snoozedUntil: past }))?.kind, "photo_digest");
});

test("больше одного сообщения в день не бывает", () => {
  assert.equal(planReminder(context({ lastReminderOn: "2026-07-28" })), null);
  assert.equal(planReminder(context({ lastReminderOn: "2026-07-27" }))?.kind, "photo_digest");
});

test("ночью и ранним утром бот молчит", () => {
  for (const localHour of [0, 3, 6, 8, 22, 23]) {
    assert.equal(planReminder(context({ localHour, digestHour: 9 })), null, `час ${localHour}`);
  }
});

test("до часа дайджеста не пишем, начиная с него — пишем", () => {
  assert.equal(planReminder(context({ localHour: 19, digestHour: 20 })), null);
  assert.equal(planReminder(context({ localHour: 20, digestHour: 20 }))?.kind, "photo_digest");
  assert.equal(planReminder(context({ localHour: 21, digestHour: 20 }))?.kind, "photo_digest");
});

test("час дайджеста за пределами тихих часов не запирает напоминания навсегда", () => {
  // Значение из базы могло приехать любым; нормализация обязана оставить
  // его в окне, где бот вообще имеет право писать.
  const plan = planReminder(context({ localHour: 21, digestHour: 23 }));
  assert.equal(plan?.kind, "photo_digest");
});

test("пустой день без фото получает мягкое напоминание", () => {
  const plan = planReminder(context({ pendingPhotosToday: 0, mealsToday: 0 }));
  assert.equal(plan?.kind, "gentle_nudge");
  assert.equal(plan.text, GENTLE_NUDGE_TEXT);
});

test("в напоминании нет упрёка", () => {
  const texts = [GENTLE_NUDGE_TEXT, photoDigestText(3)];
  for (const text of texts) {
    assert.doesNotMatch(text, /пропустил|забыл|снова|опять|срыв|серия|подряд/i, text);
  }
});

test("записанный день без фото не получает ничего", () => {
  assert.equal(planReminder(context({ pendingPhotosToday: 0, mealsToday: 3 })), null);
});

test("фото важнее мягкого напоминания: показываем то, где есть что делать", () => {
  const plan = planReminder(context({ pendingPhotosToday: 2, mealsToday: 5 }));
  assert.equal(plan?.kind, "photo_digest");
});

test("текст дайджеста согласуется с числом фото", () => {
  assert.match(photoDigestText(1), /^Собрали ваш день: 1 фото ждёт разбора\./);
  assert.match(photoDigestText(2), /2 фото ждут разбора/);
  assert.match(photoDigestText(5), /5 фото ждут разбора/);
  assert.match(photoDigestText(11), /11 фото ждут разбора/);
});

test("час дайджеста нормализуется в допустимое окно", () => {
  assert.equal(normalizeDigestHour(20), 20);
  assert.equal(normalizeDigestHour(0), MIN_DIGEST_HOUR);
  assert.equal(normalizeDigestHour(23), MAX_DIGEST_HOUR);
  assert.equal(normalizeDigestHour(-5), MIN_DIGEST_HOUR);
  assert.equal(normalizeDigestHour("не число"), DEFAULT_DIGEST_HOUR);
  assert.equal(normalizeDigestHour(null), MIN_DIGEST_HOUR); // Number(null) === 0
  assert.equal(normalizeDigestHour(19.7), 19);
});

test("пауза действительно переносит следующий заход за завтра", () => {
  const until = snoozeUntil(NOW);
  assert.ok(until.getTime() - NOW.getTime() > 48 * 60 * 60 * 1000);
});

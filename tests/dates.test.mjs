import test from "node:test";
import assert from "node:assert/strict";
import { formatDayAgoRu, formatDayRu, isValidDay, localMoment, shiftDay } from "../lib/dates.ts";

test("момент раскладывается по таймзоне продукта, а не по таймзоне сервера", () => {
  // 20:30 UTC — это уже 23:30 в Москве того же дня.
  const m = localMoment(new Date("2026-07-28T20:30:00Z"), "Europe/Moscow");
  assert.deepEqual(m, { day: "2026-07-28", time: "23:30", hour: 23 });
});

test("вечер по UTC может быть уже следующим днём в Москве", () => {
  // Фото, присланное в 21:10 UTC, в Москве относится к 29-му числу.
  const m = localMoment(new Date("2026-07-28T21:10:00Z"), "Europe/Moscow");
  assert.equal(m.day, "2026-07-29");
  assert.equal(m.time, "00:10");
  assert.equal(m.hour, 0);
});

test("полночь даёт час 0, а не 24", () => {
  const m = localMoment(new Date("2026-07-28T21:00:00Z"), "Europe/Moscow");
  assert.equal(m.hour, 0);
  assert.equal(m.time, "00:00");
});

test("полдень остаётся 12, а не 0", () => {
  const m = localMoment(new Date("2026-07-28T09:00:00Z"), "Europe/Moscow");
  assert.equal(m.time, "12:00");
  assert.equal(m.hour, 12);
});

test("другие таймзоны работают так же", () => {
  const at = new Date("2026-07-28T20:30:00Z");
  assert.equal(localMoment(at, "Asia/Yekaterinburg").time, "01:30");
  assert.equal(localMoment(at, "UTC").day, "2026-07-28");
});

test("день из localMoment принимается остальным кодом дат", () => {
  const { day } = localMoment(new Date("2026-01-01T00:00:00Z"), "Europe/Moscow");
  assert.ok(isValidDay(day));
  assert.equal(shiftDay(day, -1), "2025-12-31");
  assert.equal(typeof formatDayRu(day), "string");
});

/**
 * Подпись давности в списке «Повторить». Ближние дни — словами: человек
 * помнит «вчера», а «31 июля» ему приходится соотносить с сегодняшним числом.
 */

test("ближние дни называются словами, дальние — датой", () => {
  const today = "2026-08-01";
  assert.equal(formatDayAgoRu("2026-08-01", today), "сегодня");
  assert.equal(formatDayAgoRu("2026-07-31", today), "вчера");
  assert.equal(formatDayAgoRu("2026-07-30", today), "позавчера");
  assert.equal(formatDayAgoRu("2026-07-29", today), "29 июля");
});

test("подпись давности переживает границу месяца и года", () => {
  // Строковое сравнение дат здесь не годится: «вчера» для 1 января — это
  // 31 декабря прошлого года, а не «31 января».
  assert.equal(formatDayAgoRu("2025-12-31", "2026-01-01"), "вчера");
  assert.equal(formatDayAgoRu("2026-06-30", "2026-07-01"), "вчера");
  assert.equal(formatDayAgoRu("2026-02-28", "2026-03-01"), "вчера");
});

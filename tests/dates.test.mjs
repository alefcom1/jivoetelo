import test from "node:test";
import assert from "node:assert/strict";
import { formatDayRu, isValidDay, localMoment, shiftDay } from "../lib/dates.ts";

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

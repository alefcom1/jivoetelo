import test from "node:test";
import assert from "node:assert/strict";
import { computeAdherence, hasEnoughAdherenceData, MIN_ADHERENCE_DAYS } from "../lib/adherence.ts";

// 2026-07-30 — четверг. Опираемся на реальную дату, чтобы тесты читались
// предметно, но сами вычисления по ней не зависят от «сейчас».
const TODAY = "2026-07-30";

test("окно в 7 дней раскладывает по одному дню на каждый день недели", () => {
  const result = computeAdherence([], TODAY, "2026-07-01", 7);
  assert.equal(result.totalDays, 7);
  assert.equal(result.days.length, 7);
  for (const day of result.days) assert.equal(day.totalCount, 1, day.label);
  assert.equal(result.windowStart, "2026-07-24"); // 7 дней, включая сегодня
});

test("понедельник — нулевой индекс, воскресенье — последний", () => {
  const result = computeAdherence([], TODAY, "2026-07-01", 7);
  assert.equal(result.days[0].label, "Пн");
  assert.equal(result.days[6].label, "Вс");
});

test("логированные дни попадают в правильный день недели", () => {
  // 2026-07-27 — понедельник, 2026-07-30 — четверг.
  const result = computeAdherence(["2026-07-27", "2026-07-30"], TODAY, "2026-07-01", 7);
  const monday = result.days.find((d) => d.label === "Пн");
  const thursday = result.days.find((d) => d.label === "Чт");
  assert.equal(monday.loggedCount, 1);
  assert.equal(thursday.loggedCount, 1);
  assert.equal(result.totalLoggedDays, 2);
  for (const day of result.days) {
    if (day.label !== "Пн" && day.label !== "Чт") assert.equal(day.loggedCount, 0, day.label);
  }
});

test("окно не заходит раньше даты регистрации", () => {
  // Аккаунт заведён позавчера — при maxWindowDays=56 окно всё равно короче.
  const earliestDay = "2026-07-28";
  const result = computeAdherence([], TODAY, earliestDay, 56);
  assert.equal(result.windowStart, earliestDay);
  assert.equal(result.totalDays, 3); // 28, 29, 30 июля
});

test("окно не длиннее maxWindowDays, даже если аккаунт старый", () => {
  const result = computeAdherence([], TODAY, "2020-01-01", 14);
  assert.equal(result.totalDays, 14);
});

test("повторно залогированный день не считается дважды", () => {
  const result = computeAdherence(["2026-07-30", "2026-07-30"], TODAY, "2026-07-01", 7);
  assert.equal(result.totalLoggedDays, 1);
});

test("дни вне окна не влияют на подсчёт", () => {
  const result = computeAdherence(["2020-01-01"], TODAY, "2026-07-01", 7);
  assert.equal(result.totalLoggedDays, 0);
});

test("порог достаточности данных — неделя, ни днём меньше", () => {
  assert.equal(hasEnoughAdherenceData(computeAdherence([], TODAY, "2026-07-24", 56)), true);
  assert.equal(hasEnoughAdherenceData(computeAdherence([], TODAY, "2026-07-25", 56)), false);
  assert.equal(MIN_ADHERENCE_DAYS, 7);
});

test("полностью залогированное окно — 100% по каждому дню", () => {
  const days = [];
  for (let d = new Date("2026-07-24T12:00:00Z"); d <= new Date("2026-07-30T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const result = computeAdherence(days, TODAY, "2026-07-01", 7);
  for (const day of result.days) assert.equal(day.loggedCount, day.totalCount, day.label);
  assert.equal(result.totalLoggedDays, 7);
});

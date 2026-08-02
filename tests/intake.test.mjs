import test from "node:test";
import assert from "node:assert/strict";
import { buildIntake, pickCandidates } from "../lib/intake.ts";
import { FLAG_ALCOHOL, FLAG_LATE_MEAL, MIN_N_WITH } from "../lib/weight-response.ts";

const meal = (id, eatenOn, eatenTime) => ({ id, eatenOn, eatenTime });
const item = (mealId, dishKey, grams = 100, kcalPer100 = 200) => ({ mealId, dishKey, grams, kcalPer100 });

test("сворачивает приёмы в дни: калории, число приёмов, время последнего", () => {
  const [day] = buildIntake(
    [meal(1, "2026-03-01", "08:00"), meal(2, "2026-03-01", "19:40")],
    [item(1, "dish:ovsyanka", 200, 90), item(2, "dish:grechka", 150, 120)],
  );
  assert.equal(day.day, "2026-03-01");
  assert.equal(day.mealCount, 2);
  assert.equal(day.kcal, Math.round((200 * 90) / 100 + (150 * 120) / 100));
  assert.equal(day.lastMealTime, "19:40");
  assert.deepEqual([...day.keys].sort(), ["dish:grechka", "dish:ovsyanka"]);
});

test("одно и то же блюдо дважды за день — один ключ", () => {
  const [day] = buildIntake(
    [meal(1, "2026-03-01", "08:00"), meal(2, "2026-03-01", "13:00")],
    [item(1, "dish:kofe"), item(2, "dish:kofe")],
  );
  assert.deepEqual(day.keys, ["dish:kofe"]);
});

test("алкоголь помечает день", () => {
  const [withBeer] = buildIntake([meal(1, "2026-03-01", "20:00")], [item(1, "dish:pivo")]);
  assert.equal(withBeer.hasAlcohol, true);
  const [without] = buildIntake([meal(1, "2026-03-01", "20:00")], [item(1, "dish:kefir")]);
  assert.equal(without.hasAlcohol, false);
});

test("позиции без ключа считаются в калории, но день не портят", () => {
  // Так выглядят записи старше миграции 0015, пока их не разобрал бэкфилл.
  const [day] = buildIntake(
    [meal(1, "2026-03-01", "08:00")],
    [item(1, null, 100, 300), item(1, "dish:hleb", 50, 250)],
  );
  assert.equal(day.kcal, 300 + 125);
  assert.deepEqual(day.keys, ["dish:hleb"], "ключа нет — в набор не попал");
});

test("дни отсортированы по возрастанию", () => {
  const days = buildIntake(
    [meal(1, "2026-03-03", "08:00"), meal(2, "2026-03-01", "08:00"), meal(3, "2026-03-02", "08:00")],
    [],
  );
  assert.deepEqual(days.map((d) => d.day), ["2026-03-01", "2026-03-02", "2026-03-03"]);
});

test("в кандидаты попадают только достаточно частые ключи", () => {
  const intake = Array.from({ length: 20 }, (_, i) => ({
    day: `2026-03-${String(i + 1).padStart(2, "0")}`,
    kcal: 2000,
    mealCount: 3,
    // Частое блюдо — каждый день, редкое — трижды.
    keys: i < 3 ? ["dish:chastoe", "dish:redkoe"] : ["dish:chastoe"],
    lastMealTime: "19:00",
    hasAlcohol: false,
  }));
  const candidates = pickCandidates(intake);
  assert.ok(candidates.includes("dish:chastoe"));
  assert.ok(!candidates.includes("dish:redkoe"), `порог — ${MIN_N_WITH} дней`);
});

test("признаки дня — такие же кандидаты, как блюда", () => {
  const intake = Array.from({ length: 10 }, (_, i) => ({
    day: `2026-03-${String(i + 1).padStart(2, "0")}`,
    kcal: 2000,
    mealCount: 3,
    keys: [],
    lastMealTime: "22:30",
    hasAlcohol: true,
  }));
  const candidates = pickCandidates(intake);
  assert.ok(candidates.includes(FLAG_ALCOHOL), "алкоголь выводится из дня, а не лежит в keys");
  assert.ok(candidates.includes(FLAG_LATE_MEAL));
});

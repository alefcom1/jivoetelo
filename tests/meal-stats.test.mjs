import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMealStats,
  describePeriod,
  hasEnoughMealStats,
  MIN_STATS_DAYS,
} from "../lib/meal-stats.ts";

// 2026-07-30 — четверг. Дата реальная, но вычисления от «сейчас» не зависят.
const TODAY = "2026-07-30";
const LONG_AGO = "2026-01-01";

function meal(eatenOn, eatenTime, mealType = "lunch") {
  return { eatenOn, eatenTime, mealType };
}

test("недельное окно — семь дней, месячное — тридцать", () => {
  const stats = computeMealStats([], TODAY, LONG_AGO);
  assert.equal(stats.week.days, 7);
  assert.equal(stats.week.from, "2026-07-24");
  assert.equal(stats.month.days, 30);
  assert.equal(stats.month.from, "2026-07-01");
});

test("окно не заходит раньше первого дня человека в сервисе", () => {
  const stats = computeMealStats([], TODAY, "2026-07-28");
  assert.equal(stats.week.days, 3);
  assert.equal(stats.week.from, "2026-07-28");
  assert.equal(stats.month.days, 3, "месяц у новичка тоже не длиннее его истории");
});

test("считает приёмы пищи за неделю и за месяц раздельно", () => {
  const stats = computeMealStats(
    [
      meal("2026-07-30", "13:00"),
      meal("2026-07-29", "13:10"),
      // За пределами недели, но внутри месяца.
      meal("2026-07-10", "12:40"),
      // За пределами обоих окон — не должно попасть никуда.
      meal("2026-05-01", "12:00"),
    ],
    TODAY,
    LONG_AGO,
  );
  assert.equal(stats.week.mealCount, 2);
  assert.equal(stats.month.mealCount, 3);
});

test("приёмы в день считаются по дням с записями, а не по всем дням окна", () => {
  // Три приёма в один день, остальные шесть дней недели пустые.
  const stats = computeMealStats(
    [meal("2026-07-30", "08:00"), meal("2026-07-30", "13:00"), meal("2026-07-30", "19:00")],
    TODAY,
    LONG_AGO,
  );
  assert.equal(stats.week.daysLogged, 1);
  assert.equal(stats.week.perLoggedDay, 3, "3 приёма / 1 день с записями, а не / 7 дней окна");
});

test("без записей среднее — null, а не ноль", () => {
  const stats = computeMealStats([], TODAY, LONG_AGO);
  assert.equal(stats.week.perLoggedDay, null);
  assert.equal(stats.week.mealCount, 0);
});

test("разбивка по типам отсортирована по убыванию частоты", () => {
  const stats = computeMealStats(
    [
      meal("2026-07-30", "08:00", "breakfast"),
      meal("2026-07-29", "08:10", "breakfast"),
      meal("2026-07-28", "08:20", "breakfast"),
      meal("2026-07-30", "13:00", "lunch"),
      meal("2026-07-29", "13:00", "lunch"),
      meal("2026-07-30", "22:00", "snack"),
    ],
    TODAY,
    LONG_AGO,
  );
  assert.deepEqual(
    stats.week.byType.map((t) => [t.mealType, t.count]),
    [["breakfast", 3], ["lunch", 2], ["snack", 1]],
  );
  assert.equal(stats.week.byType[0].label, "Завтрак");
});

test("обычное время — медиана, и один ночной выброс её не сдвигает", () => {
  const stats = computeMealStats(
    [
      meal("2026-07-30", "19:00", "dinner"),
      meal("2026-07-29", "19:10", "dinner"),
      meal("2026-07-28", "18:50", "dinner"),
      meal("2026-07-27", "19:05", "dinner"),
      // Один ужин в час ночи: среднее уехало бы на несколько часов.
      meal("2026-07-26", "01:00", "dinner"),
    ],
    TODAY,
    LONG_AGO,
  );
  assert.equal(stats.week.byType[0].typicalTime, "19:00");
});

test("чётное число приёмов — медиана как середина между двумя средними", () => {
  const stats = computeMealStats(
    [
      meal("2026-07-30", "12:00", "lunch"),
      meal("2026-07-29", "14:00", "lunch"),
    ],
    TODAY,
    LONG_AGO,
  );
  assert.equal(stats.week.byType[0].typicalTime, "13:00");
});

test("мусор во времени не ломает медиану и не считается за приём времени", () => {
  const stats = computeMealStats(
    [
      meal("2026-07-30", "", "lunch"),
      meal("2026-07-29", "25:99", "lunch"),
      meal("2026-07-28", "12:30", "lunch"),
    ],
    TODAY,
    LONG_AGO,
  );
  assert.equal(stats.week.byType[0].typicalTime, "12:30");
  assert.equal(stats.week.mealCount, 3, "сам приём пищи считается, даже если время нечитаемо");
});

test("порог показа: меньше трёх дней истории или ноль приёмов — рано", () => {
  const fresh = computeMealStats([meal(TODAY, "13:00")], TODAY, TODAY);
  assert.equal(fresh.week.days, 1);
  assert.equal(hasEnoughMealStats(fresh.week), false, `порог — ${MIN_STATS_DAYS} дня`);

  const empty = computeMealStats([], TODAY, LONG_AGO);
  assert.equal(hasEnoughMealStats(empty.week), false, "дней хватает, а приёмов нет");

  const enough = computeMealStats([meal(TODAY, "13:00")], TODAY, "2026-07-28");
  assert.equal(hasEnoughMealStats(enough.week), true);
});

test("описание периода не содержит оценок", () => {
  const stats = computeMealStats(
    [
      meal("2026-07-30", "08:00", "breakfast"),
      meal("2026-07-29", "08:10", "breakfast"),
      meal("2026-07-30", "13:00", "lunch"),
    ],
    TODAY,
    LONG_AGO,
  );
  const text = describePeriod(stats.week);
  assert.match(text, /3 приёма пищи/);
  assert.match(text, /завтрак/i);
  assert.match(text, /08:05/, "обычное время главного типа приёма");
  // Тот же запрет, что проверяется для недельного обзора в review.test.mjs.
  for (const forbidden of ["мало", "много", "плохо", "хорошо", "вредн", "полезн", "сорвал", "провал", "должны"]) {
    assert.ok(!text.toLowerCase().includes(forbidden), `в тексте не должно быть «${forbidden}»: ${text}`);
  }
});

test("пустой период говорит об этом без упрёка", () => {
  const stats = computeMealStats([], TODAY, LONG_AGO);
  const text = describePeriod(stats.week);
  assert.match(text, /записей не было/);
  assert.ok(!text.toLowerCase().includes("пропустил"));
});

test("русские числительные согласованы", () => {
  const one = computeMealStats([meal("2026-07-30", "13:00")], TODAY, LONG_AGO);
  assert.match(describePeriod(one.week), /1 приём пищи/);

  const five = computeMealStats(
    Array.from({ length: 5 }, (_, i) => meal(`2026-07-2${5 + (i % 5)}`, "13:00")),
    TODAY,
    LONG_AGO,
  );
  assert.match(describePeriod(five.week), /5 приёмов пищи/);
});

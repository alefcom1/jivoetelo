import assert from "node:assert/strict";
import { test } from "node:test";
import { compositionKey, frequentMeals, MIN_OCCURRENCES } from "../lib/frequent-meals.ts";

function item(name, grams, kcalPer100 = 100, proteinPer100 = 10) {
  return { name, grams, kcalPer100, proteinPer100, fatPer100: 0, carbsPer100: 0, fiberPer100: 0, confidence: "high" };
}

function meal(mealId, eatenOn, items, mealType = "breakfast") {
  return { mealId, eatenOn, mealType, items };
}

test("состав, встреченный один раз, не попадает в «как обычно»", () => {
  const result = frequentMeals([meal(1, "2026-07-01", [item("Овсянка", 250)])]);
  assert.deepEqual(result, []);
});

test("повторяющийся состав становится подсказкой", () => {
  const result = frequentMeals([
    meal(1, "2026-07-01", [item("Овсянка", 250)]),
    meal(2, "2026-07-02", [item("Овсянка", 250)]),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].count, 2);
  assert.equal(result[0].title, "Овсянка");
});

test("порядок позиций не создаёт разных составов", () => {
  // Разбор может вернуть позиции в любом порядке — для человека это один и
  // тот же завтрак.
  const result = frequentMeals([
    meal(1, "2026-07-01", [item("Овсянка", 250), item("Банан", 120)]),
    meal(2, "2026-07-02", [item("Банан", 120), item("Овсянка", 250)]),
  ]);
  assert.equal(result.length, 1, "должна получиться одна подсказка, а не две");
  assert.equal(result[0].count, 2);
});

test("регистр и ё не создают разных составов", () => {
  assert.equal(compositionKey([{ name: "Гречка" }]), compositionKey([{ name: "гречка" }]));
  assert.equal(compositionKey([{ name: "Свёкла" }]), compositionKey([{ name: "свекла" }]));
  assert.equal(compositionKey([{ name: "  Творог   5%  " }]), compositionKey([{ name: "творог 5%" }]));
});

test("разный вес порции — тот же состав", () => {
  // Вес правится степпером и в ключ не входит: иначе каждая порция плодила
  // бы отдельную подсказку и «как обычно» перестало бы работать вовсе.
  const result = frequentMeals([
    meal(1, "2026-07-01", [item("Овсянка", 250)]),
    meal(2, "2026-07-02", [item("Овсянка", 200)]),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].count, 2);
});

test("порции и КБЖУ берутся из последнего раза", () => {
  // Человек однажды поправил вес — повтор должен наследовать исправленное.
  const result = frequentMeals([
    meal(1, "2026-07-01", [item("Овсянка", 250)]),
    meal(2, "2026-07-05", [item("Овсянка", 180)]),
    meal(3, "2026-07-03", [item("Овсянка", 220)]),
  ]);
  assert.equal(result[0].items[0].grams, 180, "ожидали вес из записи за 5 июля");
  assert.equal(result[0].lastEatenOn, "2026-07-05");
});

test("сортировка: сначала частота, при равенстве — свежесть", () => {
  const result = frequentMeals([
    // Три раза, но давно.
    meal(1, "2026-06-01", [item("Творог", 150)]),
    meal(2, "2026-06-02", [item("Творог", 150)]),
    meal(3, "2026-06-03", [item("Творог", 150)]),
    // Два раза, но на днях.
    meal(4, "2026-07-20", [item("Гречка", 180)]),
    meal(5, "2026-07-21", [item("Гречка", 180)]),
    // Тоже два раза и ещё свежее.
    meal(6, "2026-07-25", [item("Яйца", 110)]),
    meal(7, "2026-07-26", [item("Яйца", 110)]),
  ]);
  assert.deepEqual(result.map((r) => r.title), ["Творог", "Яйца", "Гречка"]);
});

test("итоги считаются по последнему составу", () => {
  const result = frequentMeals([
    meal(1, "2026-07-01", [item("Курица", 100, 165, 31)]),
    meal(2, "2026-07-02", [item("Курица", 200, 165, 31)]),
  ]);
  assert.equal(result[0].kcal, 330);
  assert.equal(result[0].protein, 62);
});

test("список обрезается и не длиннее лимита", () => {
  const meals = [];
  for (let i = 0; i < 10; i++) {
    meals.push(meal(i * 2, "2026-07-01", [item(`Блюдо ${i}`, 100)]));
    meals.push(meal(i * 2 + 1, "2026-07-02", [item(`Блюдо ${i}`, 100)]));
  }
  assert.equal(frequentMeals(meals).length, 6);
  assert.equal(frequentMeals(meals, 3).length, 3);
});

test("пустые приёмы пищи пропускаются, а не ломают группировку", () => {
  const result = frequentMeals([
    meal(1, "2026-07-01", []),
    meal(2, "2026-07-02", []),
    meal(3, "2026-07-03", [item("Овсянка", 250)]),
    meal(4, "2026-07-04", [item("Овсянка", 250)]),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Овсянка");
});

test("порог повторов вынесен константой и соблюдается", () => {
  const once = Array.from({ length: MIN_OCCURRENCES - 1 }, (_, i) =>
    meal(i, `2026-07-0${i + 1}`, [item("Суп", 300)]));
  assert.deepEqual(frequentMeals(once), []);
  const enough = Array.from({ length: MIN_OCCURRENCES }, (_, i) =>
    meal(i, `2026-07-0${i + 1}`, [item("Суп", 300)]));
  assert.equal(frequentMeals(enough).length, 1);
});

test("пустой вход — пустой результат", () => {
  assert.deepEqual(frequentMeals([]), []);
});

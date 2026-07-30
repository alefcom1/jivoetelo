import test from "node:test";
import assert from "node:assert/strict";
import { buildDiaryMeals, clampDiaryDay, diaryDayTotals, previewItemNames } from "../lib/diary.ts";

test("превью состава показывает все позиции, если их не больше лимита", () => {
  assert.equal(previewItemNames(["омлет", "тост"]), "омлет, тост");
});

test("превью сворачивает лишние позиции в «и ещё N»", () => {
  assert.equal(previewItemNames(["омлет", "тост", "кофе", "сыр", "джем"]), "омлет, тост, кофе и ещё 2");
});

test("пустой состав даёт пустую строку превью", () => {
  assert.equal(previewItemNames([]), "");
});

test("группирует позиции по приёму пищи и считает итоги", () => {
  const meals = [
    { id: 1, eatenTime: "08:00", mealType: "breakfast", photoKey: null },
    { id: 2, eatenTime: "13:00", mealType: "lunch", photoKey: "1/a.jpg" },
  ];
  const items = [
    { mealId: 1, name: "омлет", grams: 150, kcalPer100: 150, proteinPer100: 12, fatPer100: 10, carbsPer100: 1, fiberPer100: 0 },
    { mealId: 2, name: "суп", grams: 300, kcalPer100: 60, proteinPer100: 3, fatPer100: 2, carbsPer100: 6, fiberPer100: 1 },
  ];
  const result = buildDiaryMeals(meals, items);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].typeLabel, "Завтрак");
  assert.equal(result[0].itemsPreview, "омлет");
  assert.equal(result[0].totals.kcal, 225);
  assert.equal(result[1].photoKey, "1/a.jpg");
});

test("список сортируется по времени независимо от порядка входных строк", () => {
  const meals = [
    { id: 2, eatenTime: "19:30", mealType: "dinner", photoKey: null },
    { id: 1, eatenTime: "08:00", mealType: "breakfast", photoKey: null },
  ];
  const result = buildDiaryMeals(meals, []);
  assert.deepEqual(result.map((m) => m.id), [1, 2]);
});

test("приём без позиций не ломает подсчёт — просто нулевые итоги", () => {
  const meals = [{ id: 1, eatenTime: "08:00", mealType: "snack", photoKey: null }];
  const result = buildDiaryMeals(meals, []);
  assert.equal(result[0].itemCount, 0);
  assert.equal(result[0].itemsPreview, "");
  assert.deepEqual(result[0].totals, { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
});

test("позиции чужого приёма пищи не попадают в чужие итоги", () => {
  const meals = [
    { id: 1, eatenTime: "08:00", mealType: "breakfast", photoKey: null },
    { id: 2, eatenTime: "09:00", mealType: "snack", photoKey: null },
  ];
  const items = [
    { mealId: 1, name: "каша", grams: 200, kcalPer100: 100, proteinPer100: 3, fatPer100: 2, carbsPer100: 15, fiberPer100: 2 },
  ];
  const result = buildDiaryMeals(meals, items);
  assert.equal(result[0].itemCount, 1);
  assert.equal(result[1].itemCount, 0);
});

test("mealType без известной метки использует общую подпись «Приём пищи»", () => {
  const meals = [{ id: 1, eatenTime: "10:00", mealType: "weird", photoKey: null }];
  const result = buildDiaryMeals(meals, []);
  assert.equal(result[0].typeLabel, "Приём пищи");
});

test("итог дня складывает все позиции всех приёмов", () => {
  const items = [
    { name: "a", grams: 100, kcalPer100: 100, proteinPer100: 10, fatPer100: 5, carbsPer100: 5, fiberPer100: 1 },
    { name: "b", grams: 100, kcalPer100: 200, proteinPer100: 20, fatPer100: 10, carbsPer100: 10, fiberPer100: 2 },
  ];
  assert.deepEqual(diaryDayTotals(items), { kcal: 300, protein: 30, fat: 15, carbs: 15, fiber: 3 });
});

test("итог дня без записей — нули, а не ошибка", () => {
  assert.deepEqual(diaryDayTotals([]), { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
});

test("день дневника не может быть в будущем", () => {
  assert.equal(clampDiaryDay("2026-08-05", "2026-07-30"), "2026-07-30");
  assert.equal(clampDiaryDay("2026-07-15", "2026-07-30"), "2026-07-15");
  assert.equal(clampDiaryDay("2026-07-30", "2026-07-30"), "2026-07-30");
});

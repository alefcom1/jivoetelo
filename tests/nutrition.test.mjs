import test from "node:test";
import assert from "node:assert/strict";
import { itemTotals, sumTotals } from "../lib/nutrition.ts";

const buckwheat = { grams: 200, kcalPer100: 110, proteinPer100: 4.2, fatPer100: 1.1, carbsPer100: 21.3, fiberPer100: 3.7 };
const chicken = { grams: 150, kcalPer100: 165, proteinPer100: 31, fatPer100: 3.6, carbsPer100: 0, fiberPer100: 0 };

test("itemTotals пересчитывает значения на вес порции", () => {
  const t = itemTotals(buckwheat);
  assert.equal(t.kcal, 220);
  assert.equal(t.protein, 8.4);
  assert.equal(t.fiber, 7.4);
});

test("itemTotals округляет: ккал до целых, макросы до 0.1 г", () => {
  const t = itemTotals({ grams: 33, kcalPer100: 100, proteinPer100: 10, fatPer100: 0, carbsPer100: 0, fiberPer100: 0 });
  assert.equal(t.kcal, 33);
  assert.equal(t.protein, 3.3);
});

test("sumTotals складывает позиции", () => {
  const t = sumTotals([buckwheat, chicken]);
  assert.equal(t.kcal, 220 + 248);
  assert.equal(t.protein, 8.4 + 46.5);
  assert.equal(t.fat, 7.6);
});

test("sumTotals на пустом списке даёт нули", () => {
  assert.deepEqual(sumTotals([]), { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
});

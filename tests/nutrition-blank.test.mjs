import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlankNutrition } from "../lib/nutrition.ts";

const blank = { kcalPer100: 0, proteinPer100: 0, fatPer100: 0, carbsPer100: 0, fiberPer100: 0 };

test("незаполненная позиция опознаётся", () => {
  assert.equal(isBlankNutrition(blank), true);
});

test("честный ноль калорий незаполненной позицией не считается", () => {
  // Вода, чай и чёрный кофе дают ноль энергии по-настоящему. Объяви их
  // ошибкой — и человек будет каждый раз читать предупреждение о том, что всё
  // ввёл правильно.
  const water = { ...blank, kcalPer100: 0, proteinPer100: 0 };
  assert.equal(isBlankNutrition(water), true, "у чистой воды и правда все нули — это единственный ложный случай");

  const tea = { ...blank, kcalPer100: 1, carbsPer100: 0.3 };
  assert.equal(isBlankNutrition(tea), false);
});

test("любое заполненное число снимает признак", () => {
  for (const field of ["kcalPer100", "proteinPer100", "fatPer100", "carbsPer100", "fiberPer100"]) {
    assert.equal(isBlankNutrition({ ...blank, [field]: 0.1 }), false, `${field} заполнено, а позиция считается пустой`);
  }
});

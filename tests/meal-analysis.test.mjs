import test from "node:test";
import assert from "node:assert/strict";
import { validateMealAnalysis } from "../lib/ai/schema.ts";
import { MealAnalysisError } from "../lib/ai/types.ts";

const validItem = {
  name: "Гречка отварная",
  estimatedGrams: 200,
  confidence: "high",
  per100g: { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3, fiber: 3.7 },
};

test("валидный разбор проходит без изменений", () => {
  const result = validateMealAnalysis({
    mealType: "lunch",
    items: [validItem],
    clarifications: [
      {
        question: "Какая была заправка?",
        options: [
          { label: "Масло", addItem: { ...validItem, name: "Оливковое масло", estimatedGrams: 10 } },
          { label: "Без заправки" },
        ],
      },
    ],
  });
  assert.equal(result.mealType, "lunch");
  assert.equal(result.items.length, 1);
  assert.equal(result.clarifications.length, 1);
  assert.equal(result.clarifications[0].options[0].addItem.name, "Оливковое масло");
});

test("выходящие за пределы значения зажимаются", () => {
  const result = validateMealAnalysis({
    mealType: "dinner",
    items: [{ ...validItem, estimatedGrams: 99999, per100g: { kcal: 5000, protein: -3, fat: 1, carbs: 1, fiber: 1 } }],
    clarifications: [],
  });
  assert.equal(result.items[0].estimatedGrams, 3000);
  assert.equal(result.items[0].per100g.kcal, 900);
  assert.equal(result.items[0].per100g.protein, 0);
});

test("неизвестный mealType заменяется на other, мусорные позиции отбрасываются", () => {
  const result = validateMealAnalysis({
    mealType: "brunch",
    items: [validItem, { name: "   " }, null, 42],
    clarifications: "не массив",
  });
  assert.equal(result.mealType, "other");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.clarifications, []);
});

test("уточнений не больше двух, вопросы с одним вариантом отбрасываются", () => {
  const clar = { question: "Вопрос?", options: [{ label: "Да" }, { label: "Нет" }] };
  const result = validateMealAnalysis({
    mealType: "snack",
    items: [validItem],
    clarifications: [clar, clar, clar, { question: "Один вариант?", options: [{ label: "Да" }] }],
  });
  assert.equal(result.clarifications.length, 2);
});

test("разбор без единой позиции — ошибка invalid_output", () => {
  assert.throws(
    () => validateMealAnalysis({ mealType: "lunch", items: [], clarifications: [] }),
    (error) => error instanceof MealAnalysisError && error.reason === "invalid_output",
  );
});

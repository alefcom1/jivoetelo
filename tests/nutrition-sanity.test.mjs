import test from "node:test";
import assert from "node:assert/strict";
import { atwaterKcal, reconcilePer100g } from "../lib/nutrition-sanity.ts";
import { validateMealAnalysis } from "../lib/ai/schema.ts";

test("согласованные значения проходят без изменений", () => {
  const chicken = { kcal: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0 };
  const result = reconcilePer100g(chicken);
  assert.equal(result.adjusted, false);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.per100g, chicken);
});

test("завышенная калорийность заменяется на расчётную по Атуотеру", () => {
  const result = reconcilePer100g({ kcal: 400, protein: 3, fat: 1, carbs: 5, fiber: 0 });
  assert.equal(result.adjusted, true);
  assert.deepEqual(result.reasons, ["kcal_mismatch"]);
  assert.equal(result.per100g.kcal, atwaterKcal({ protein: 3, fat: 1, carbs: 5, fiber: 0 }));
  assert.equal(result.per100g.kcal, 41);
});

test("низкокалорийная еда не ломается абсолютным допуском (огурец)", () => {
  const cucumber = { kcal: 15, protein: 0.8, fat: 0.1, carbs: 2.8, fiber: 1 };
  const result = reconcilePer100g(cucumber);
  assert.equal(result.adjusted, false);
  assert.deepEqual(result.per100g, cucumber);
});

test("сумма макросов больше 100 г масштабируется до 100", () => {
  const result = reconcilePer100g({ kcal: 900, protein: 60, fat: 50, carbs: 20, fiber: 0 });
  assert.ok(result.reasons.includes("macros_over_100g"));
  const { protein, fat, carbs } = result.per100g;
  // округление каждого макроса по отдельности может дать погрешность в сумме до 0.1 г
  assert.ok(Math.abs(protein + fat + carbs - 100) <= 0.2);
  // пропорции между макросами сохраняются после масштабирования
  assert.equal(Math.round((protein / fat) * 100) / 100, Math.round((60 / 50) * 100) / 100);
});

test("клетчатка больше углеводов ограничивается углеводами", () => {
  const result = reconcilePer100g({ kcal: 50, protein: 1, fat: 0.2, carbs: 5, fiber: 8 });
  assert.ok(result.reasons.includes("fiber_above_carbs"));
  assert.equal(result.per100g.fiber, 5);
});

test("клетчатка повторно ограничивается после масштабирования макросов", () => {
  // до масштабирования fiber(35) <= carbs(40), но после сжатия суммы к 100 г
  // углеводов становится меньше, чем клетчатки, — нужно урезать её ещё раз
  const result = reconcilePer100g({ kcal: 900, protein: 45, fat: 45, carbs: 40, fiber: 35 });
  assert.ok(result.reasons.includes("macros_over_100g"));
  assert.ok(result.per100g.fiber <= result.per100g.carbs);
  assert.ok(result.per100g.fiber < 35);
});

test("входной объект не мутируется", () => {
  const input = { kcal: 400, protein: 3, fat: 1, carbs: 5, fiber: 0 };
  const copy = { ...input };
  reconcilePer100g(input);
  assert.deepEqual(input, copy);
});

test("итоговые значения округляются до 0.1 и зажимаются в допустимые пределы", () => {
  // экстремальный вход: 1000 г макросов на 100 г продукта — после
  // пропорционального сжатия к 100 г и пересчёта по Атуотеру калорийность
  // уже не упирается в потолок 900, поэтому проверяем именно границы диапазонов
  const result = reconcilePer100g({ kcal: 5000, protein: 1000, fat: 1000, carbs: 1000, fiber: 1000 });
  assert.ok(result.per100g.kcal >= 0 && result.per100g.kcal <= 900);
  assert.ok(result.per100g.protein >= 0 && result.per100g.protein <= 100);
  assert.ok(result.per100g.fat >= 0 && result.per100g.fat <= 100);
  assert.ok(result.per100g.carbs >= 0 && result.per100g.carbs <= 100);
  assert.ok(result.per100g.fiber >= 0 && result.per100g.fiber <= 50);
  // все значения округлены до одного знака после запятой
  for (const value of Object.values(result.per100g)) {
    assert.equal(Math.round(value * 10) / 10, value);
  }
});

test("atwaterKcal считает энергию из макросов: 4/9/4 плюс 2 за клетчатку и 7 за спирт", () => {
  assert.equal(atwaterKcal({ protein: 10, fat: 10, carbs: 10, fiber: 0 }), 40 + 90 + 40);
  // клетчатка входит в углеводы и усваивается частично: 6 г обычных углеводов
  // по 4 плюс 4 г клетчатки по 2
  assert.equal(atwaterKcal({ protein: 0, fat: 0, carbs: 10, fiber: 4 }), 24 + 8);
  assert.equal(atwaterKcal({ protein: 0, fat: 0, carbs: 0, fiber: 0, alcohol: 10 }), 70);
});

test("алкоголь не превращается в ноль калорий", () => {
  // Без учёта спирта проверка видела бы у водки «калории из ниоткуда» и
  // затирала верные 231 ккал нулём — самый опасный вид молчаливой ошибки.
  const drinks = [
    { name: "пиво 4,5%", per100g: { kcal: 43, protein: 0.5, fat: 0, carbs: 3.6, fiber: 0, alcohol: 3.6 } },
    { name: "вино сухое 12%", per100g: { kcal: 68, protein: 0.2, fat: 0, carbs: 2.6, fiber: 0, alcohol: 9.5 } },
    { name: "водка 40%", per100g: { kcal: 231, protein: 0, fat: 0, carbs: 0.1, fiber: 0, alcohol: 31.6 } },
  ];
  for (const drink of drinks) {
    const result = reconcilePer100g(drink.per100g);
    assert.equal(result.adjusted, false, `${drink.name} не должен правиться`);
    assert.equal(result.per100g.kcal, drink.per100g.kcal);
  }
});

test("высокая доля клетчатки не завышает калорийность", () => {
  // Отруби: 43 г клетчатки из 60 г углеводов. Если считать клетчатку по 4 ккал/г,
  // расчёт даёт 336 вместо честных 250 и проверка «поправила» бы верную цифру.
  const bran = { kcal: 250, protein: 15, fat: 4, carbs: 60, fiber: 43 };
  const result = reconcilePer100g(bran);
  assert.equal(result.adjusted, false);
  assert.equal(result.per100g.kcal, 250);
});

test("спирт участвует в ограничении 100 г на 100 г продукта", () => {
  const result = reconcilePer100g({ kcal: 500, protein: 20, fat: 20, carbs: 40, fiber: 0, alcohol: 60 });
  assert.ok(result.reasons.includes("macros_over_100g"));
  const { protein, fat, carbs } = result.per100g;
  // спирт масштабируется вместе с макросами, поэтому сумма сохранённых
  // макронутриентов оказывается меньше 100 г ровно на долю спирта
  assert.ok(protein + fat + carbs < 100);
  assert.ok(Math.abs(protein / fat - 1) < 0.01, "пропорции макросов сохраняются");
});

test("validateMealAnalysis понижает уверенность компонента с несходящимися КБЖУ", () => {
  const result = validateMealAnalysis({
    mealType: "lunch",
    items: [
      {
        name: "Странный салат",
        estimatedGrams: 150,
        confidence: "high",
        per100g: { kcal: 400, protein: 3, fat: 1, carbs: 5, fiber: 0 },
      },
      {
        name: "Молоко",
        estimatedGrams: 200,
        confidence: "medium",
        per100g: { kcal: 400, protein: 3, fat: 1, carbs: 5, fiber: 0 },
      },
      {
        name: "Кефир",
        estimatedGrams: 200,
        confidence: "low",
        per100g: { kcal: 400, protein: 3, fat: 1, carbs: 5, fiber: 0 },
      },
    ],
    clarifications: [],
  });
  assert.equal(result.items[0].confidence, "medium");
  assert.equal(result.items[1].confidence, "low");
  assert.equal(result.items[2].confidence, "low");
});

test("validateMealAnalysis не трогает уверенность у согласованных значений", () => {
  const result = validateMealAnalysis({
    mealType: "lunch",
    items: [
      {
        name: "Куриная грудка",
        estimatedGrams: 150,
        confidence: "high",
        per100g: { kcal: 165, protein: 31, fat: 3.6, carbs: 0, fiber: 0 },
      },
    ],
    clarifications: [],
  });
  assert.equal(result.items[0].confidence, "high");
});

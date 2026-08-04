import test from "node:test";
import assert from "node:assert/strict";
import { computeBmi, computeWaistRatio, bmiCategory, waistTargetCm, bmiCaveats } from "../lib/bmi.ts";
import { computeWater, FOOD_WATER_SHARE } from "../lib/water.ts";
import { MEASURES, weighMeasures, findMeasure } from "../lib/kitchen-measures.ts";
import { HAND_MEASURES, handGrams } from "../lib/hand-portions.ts";
import { computeRecipe, sumRecipe, searchFoods, COOKING_LOSS } from "../lib/recipe.ts";
import { fiberTarget, topFiberSources, gramsForFiber } from "../lib/fiber.ts";
import { forecastWeight, KCAL_PER_KG } from "../lib/forecast.ts";
import { FOOD_REFERENCE } from "../lib/food-reference.ts";

/**
 * Расчёты калькуляторов. Проверяем не «функция что-то вернула», а те
 * свойства, из-за нарушения которых страница показала бы человеку неправду.
 */

test("ИМТ: контрольные точки шкалы ВОЗ", () => {
  // 70 кг при 175 см — классические 22,9.
  const normal = computeBmi(70, 175);
  assert.equal(normal.bmi, 22.9);
  assert.equal(normal.category, "normal");

  assert.equal(bmiCategory(17), "underweight");
  assert.equal(bmiCategory(18.5), "normal");
  assert.equal(bmiCategory(24.9), "normal");
  assert.equal(bmiCategory(25), "overweight");
  assert.equal(bmiCategory(30), "obese_1");
  assert.equal(bmiCategory(41), "obese_3");
});

test("ИМТ: границы здорового веса согласованы с самим индексом", () => {
  const result = computeBmi(70, 175);
  // Вес на нижней границе должен давать ИМТ около 18,5, на верхней — 24,9.
  assert.ok(Math.abs(computeBmi(result.healthyWeight.from, 175).bmi - 18.5) <= 0.2);
  assert.ok(Math.abs(computeBmi(result.healthyWeight.to, 175).bmi - 24.9) <= 0.2);
});

test("ИМТ: бессмысленный ввод не превращается в число", () => {
  assert.equal(computeBmi(0, 175), null);
  assert.equal(computeBmi(70, 0), null);
  assert.equal(computeWaistRatio(80, 0), null);
});

test("талия к росту: пороги 0,5 и 0,6", () => {
  // 84/170 = 0,494 — ещё не порог: граница ровно на 0,5.
  assert.equal(computeWaistRatio(84, 170).zone, "low");
  assert.equal(computeWaistRatio(80, 170).zone, "low");
  assert.equal(computeWaistRatio(85, 170).zone, "increased");
  assert.equal(computeWaistRatio(102, 170).zone, "high");
  assert.equal(waistTargetCm(170), 85);
});

test("оговорки ИМТ появляются там, где шкала не работает", () => {
  assert.equal(bmiCaveats({ age: 30 }).length, 0);
  assert.ok(bmiCaveats({ age: 15 })[0].includes("18 лет"));
  assert.ok(bmiCaveats({ age: 70 }).length === 1);
  assert.ok(bmiCaveats({ pregnant: true }).length === 1);
  assert.ok(bmiCaveats({ athlete: true })[0].includes("мышечной массе"));
});

test("вода: напитки — это норма минус вода из еды", () => {
  const result = computeWater({ sex: "female", weightKg: 65 });
  assert.equal(result.drinkMl + result.fromFoodMl, result.totalMl);
  // Доля еды соблюдена с точностью до округления по 50 мл.
  assert.ok(Math.abs(result.fromFoodMl / result.totalMl - FOOD_WATER_SHARE) < 0.03);
  // Женская норма ниже мужской при прочих равных.
  assert.ok(result.totalMl < computeWater({ sex: "male", weightKg: 65 }).totalMl);
});

test("вода: нагрузка и жара добавляют, а не заменяют", () => {
  const calm = computeWater({ sex: "male", weightKg: 80 });
  const hard = computeWater({ sex: "male", weightKg: 80, activeHours: 2, hot: true });
  assert.ok(hard.totalMl > calm.totalMl);
  assert.equal(hard.extraMl, 1500);
  assert.equal(calm.extraMl, 0);
});

test("вода: норма не проваливается ниже разумного при малом весе", () => {
  const tiny = computeWater({ sex: "female", weightKg: 40 });
  assert.ok(tiny.totalMl >= 1200, `получили ${tiny.totalMl}`);
});

test("меры: стакан 200 мл всегда легче стакана 250 мл", () => {
  for (const row of MEASURES) {
    assert.ok(row.glass200 < row.glass250, `${row.name}: стаканы перепутаны`);
    assert.ok(row.teaspoon < row.tablespoon, `${row.name}: чайная ложка не меньше столовой`);
    assert.ok(row.tablespoon < row.glass200, `${row.name}: ложка тяжелее стакана`);
  }
});

test("меры: вес воды совпадает с объёмом", () => {
  const water = findMeasure("Вода");
  assert.equal(water.glass250, 250);
  assert.equal(water.glass200, 200);
  assert.equal(water.tablespoon, 15);
});

test("меры: набор считается как сумма", () => {
  const flour = findMeasure("Мука пшеничная");
  assert.equal(weighMeasures(flour, { glass250: 2, tablespoon: 1 }), flour.glass250 * 2 + flour.tablespoon);
  assert.equal(weighMeasures(flour, {}), 0);
});

test("меры руки: мужская мера больше женской, порядок величин разумный", () => {
  for (const measure of HAND_MEASURES) {
    assert.ok(measure.gramsMale > measure.gramsFemale, `${measure.name}: мужская мера не больше`);
    assert.ok(handGrams(measure, "female", 2) === measure.gramsFemale * 2);
  }
  const thumb = HAND_MEASURES.find((m) => m.key === "thumb");
  const fist = HAND_MEASURES.find((m) => m.key === "fist");
  assert.ok(thumb.gramsFemale < fist.gramsFemale, "большой палец не может быть больше кулака");
});

test("меры руки: примеры взяты из справочника, а не выдуманы", () => {
  const names = new Set(FOOD_REFERENCE.map((f) => f.name));
  for (const measure of HAND_MEASURES) {
    for (const example of measure.examples) {
      assert.ok(names.has(example), `«${example}» из меры «${measure.name}» нет в справочнике`);
    }
  }
});

test("рецепт: калории не зависят от веса готового, а калорийность на 100 г — зависит", () => {
  const items = [
    { name: "Гречка отварная", grams: 500 },
    { name: "Куриная грудка отварная", grams: 300 },
  ];
  const totals = sumRecipe(items);
  // 500 г гречки по 110 + 300 г грудки по 165 = 550 + 495.
  assert.equal(totals.kcal, 1045);
  assert.equal(totals.rawWeight, 800);

  const asIs = computeRecipe({ items, cooking: "none", portionG: 200 });
  const boiled = computeRecipe({ items, cooking: "boil_open", portionG: 200 });
  // Энергия всей кастрюли одна и та же…
  assert.equal(asIs.totals.kcal, boiled.totals.kcal);
  // …а на 100 г готового у выпаренного блюда выше.
  assert.ok(boiled.per100.kcal > asIs.per100.kcal);
});

test("рецепт: заданный вес готового важнее оценки по способу готовки", () => {
  const items = [{ name: "Гречка отварная", grams: 400 }];
  const guessed = computeRecipe({ items, cooking: "stew", portionG: 200 });
  const measured = computeRecipe({ items, cooking: "stew", cookedWeight: 400, portionG: 200 });
  assert.equal(measured.cookedWeight, 400);
  assert.notEqual(guessed.cookedWeight, 400);
  assert.equal(measured.per100.kcal, 110);
});

test("рецепт: порция — доля от готового блюда", () => {
  const result = computeRecipe({
    items: [{ name: "Куриная грудка отварная", grams: 200 }],
    cooking: "none",
    portionG: 100,
  });
  assert.equal(result.perPortion.kcal, Math.round(result.totals.kcal / 2));
  assert.equal(result.perPortion.grams, 100);
});

test("рецепт: неизвестный продукт не ломает расчёт", () => {
  const totals = sumRecipe([
    { name: "Такого продукта нет", grams: 100 },
    { name: "Гречка отварная", grams: 100 },
  ]);
  assert.equal(totals.kcal, 110);
  assert.equal(totals.rawWeight, 100);
});

test("рецепт: коэффициенты готовки только уменьшают массу", () => {
  for (const step of COOKING_LOSS) {
    assert.ok(step.factor > 0 && step.factor <= 1, `${step.label}: странный коэффициент`);
  }
});

test("рецепт: поиск находит по началу и по вхождению", () => {
  assert.ok(searchFoods("гречк").some((f) => f.name.includes("Гречка")));
  assert.equal(searchFoods("я").length, 0, "однобуквенный запрос ничего не ищет");
});

test("клетчатка: норма растёт с калорийностью и остаётся в границах", () => {
  assert.equal(fiberTarget().target, 25);
  const small = fiberTarget(1400);
  const big = fiberTarget(3000);
  assert.ok(small.target < big.target);
  assert.ok(small.target >= 18 && big.target <= 40);
  assert.ok(small.range.from < small.target && small.target < small.range.to);
});

test("клетчатка: источники отсортированы по порции и взяты из справочника", () => {
  const sources = topFiberSources(25, 10);
  assert.ok(sources.length > 5, "источников слишком мало");
  for (let i = 1; i < sources.length; i++) {
    assert.ok(sources[i - 1].perPortion >= sources[i].perPortion, "список не отсортирован");
  }
  const names = new Set(FOOD_REFERENCE.map((f) => f.name));
  for (const source of sources) assert.ok(names.has(source.name));
});

test("клетчатка: пересчёт «сколько граммов ради N г волокон»", () => {
  const food = FOOD_REFERENCE.find((f) => f.name === "Гречка отварная");
  // 2,7 г на 100 г → ради 5 г нужно около 185 г.
  assert.equal(gramsForFiber(food, 5), 185);
  assert.equal(gramsForFiber({ ...food, fiber: 0 }, 5), null);
});

test("прогноз: снижение затухает, а не идёт линейно", () => {
  const result = forecastWeight({ startWeightKg: 90, startTdeeKcal: 2400, intakeKcal: 1900, months: 12 });
  const firstMonth = result.points[0].weightKg - result.points[1].weightKg;
  const lastMonth = result.points[10].weightKg - result.points[11].weightKg;
  assert.ok(firstMonth > 0, "в первый месяц вес должен снижаться");
  assert.ok(lastMonth < firstMonth, "снижение обязано замедляться: расход падает вместе с весом");
});

test("прогноз: первый месяц близок к наивной формуле, дальше расходится", () => {
  const result = forecastWeight({ startWeightKg: 90, startTdeeKcal: 2400, intakeKcal: 1900, months: 12 });
  const naiveFirst = (500 * 30.4) / KCAL_PER_KG;
  const actualFirst = result.points[0].weightKg - result.points[1].weightKg;
  assert.ok(Math.abs(actualFirst - naiveFirst) < 0.3, "первый месяц не должен сильно отличаться");

  const naiveYear = (500 * 365) / KCAL_PER_KG;
  assert.ok(Math.abs(result.totalChangeKg) < naiveYear, "за год наивная формула обязана переоценить");
});

test("прогноз: при рационе выше расхода вес растёт", () => {
  const result = forecastWeight({ startWeightKg: 60, startTdeeKcal: 1800, intakeKcal: 2300, months: 6 });
  assert.ok(result.totalChangeKg > 0);
});

test("прогноз: равновесный вес существует и лежит по нужную сторону", () => {
  const losing = forecastWeight({ startWeightKg: 100, startTdeeKcal: 2600, intakeKcal: 2000, months: 24 });
  assert.ok(losing.equilibriumKg < 100, "при дефиците равновесие ниже старта");
  assert.ok(losing.equilibriumKg > 35);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { foodCategory } from "../lib/food-category.ts";
import { FOOD_REFERENCE, parseNutrient, searchFoodReference } from "../lib/food-reference.ts";

/**
 * Главная проверка справочника — сходимость по Атуотеру: 4 ккал на грамм
 * белка и углеводов, 9 на грамм жира. Клетчатку из углеводов вычитаем, она
 * почти не усваивается. Опечатка в разряде (170 вместо 17 г белка) так не
 * проходит, а именно она и есть самая вероятная ошибка в таблице чисел.
 *
 * Порог широкий с обеих сторон: таблицы дают калорийность по факту
 * измерения, а не по формуле, и расхождение в 20% — это норма, а не повод
 * править число.
 */
test("калорийность сходится с белками, жирами и углеводами", () => {
  for (const food of FOOD_REFERENCE) {
    // Почти нулевые по калорийности (чай, кофе) через отношение не проверить:
    // там и числитель, и знаменатель — шум.
    if (food.kcal < 15) continue;
    const digestibleCarbs = Math.max(0, food.carbs - food.fiber);
    const computed = food.protein * 4 + food.fat * 9 + digestibleCarbs * 4;
    const ratio = computed / food.kcal;
    assert.ok(
      ratio > 0.75 && ratio < 1.25,
      `${food.name}: по БЖУ выходит ${computed.toFixed(0)} ккал против заявленных ${food.kcal} (отношение ${ratio.toFixed(2)})`,
    );
  }
});

test("числа в разумных пределах и порция задана", () => {
  for (const food of FOOD_REFERENCE) {
    assert.ok(food.name.trim().length > 0, "пустое название");
    assert.ok(food.kcal >= 0 && food.kcal <= 900, `${food.name}: калорийность вне 0–900`);
    assert.ok(food.protein >= 0 && food.protein <= 100, `${food.name}: белок вне 0–100`);
    assert.ok(food.fat >= 0 && food.fat <= 100, `${food.name}: жиры вне 0–100`);
    assert.ok(food.carbs >= 0 && food.carbs <= 100, `${food.name}: углеводы вне 0–100`);
    assert.ok(food.fiber >= 0 && food.fiber <= food.carbs + 0.01, `${food.name}: клетчатки больше, чем углеводов`);
    assert.ok(food.portionG > 0 && food.portionG <= 500, `${food.name}: порция вне 1–500 г`);
    // Сумма макросов не может превышать 100 г на 100 г продукта.
    assert.ok(
      food.protein + food.fat + food.carbs <= 100.5,
      `${food.name}: белки, жиры и углеводы дают больше 100 г на 100 г`,
    );
  }
});

test("названия не повторяются", () => {
  const seen = new Set();
  for (const food of FOOD_REFERENCE) {
    const key = food.name.toLowerCase();
    assert.ok(!seen.has(key), `дубль: ${food.name}`);
    seen.add(key);
  }
});

test("поиск находит по началу и по середине названия", () => {
  const byStart = searchFoodReference("творог");
  assert.ok(byStart.length >= 2, "должно найтись оба творога");
  assert.ok(byStart[0].name.startsWith("Творог"), `первым ожидали творог, получили ${byStart[0]?.name}`);

  const byMiddle = searchFoodReference("греческ");
  assert.equal(byMiddle[0].name, "Йогурт греческий 2%");
});

test("совпадение с начала названия важнее совпадения в середине", () => {
  const found = searchFoodReference("мол");
  assert.equal(found[0].name, "Молоко 2,5%", `получили ${found[0]?.name}`);
  assert.ok(found.some((f) => f.name === "Шоколад молочный"), "молочный шоколад тоже должен найтись");
});

test("ё и е в запросе — одно и то же", () => {
  assert.deepEqual(searchFoodReference("мед"), searchFoodReference("мёд"));
  assert.equal(searchFoodReference("мёд")[0].name, "Мёд");
});

test("слишком короткий запрос ничего не возвращает", () => {
  // Иначе по одной букве вываливается половина справочника, и список
  // подсказок перестаёт быть подсказкой.
  assert.deepEqual(searchFoodReference("м"), []);
  assert.deepEqual(searchFoodReference(""), []);
  assert.deepEqual(searchFoodReference("   "), []);
});

test("ничего не найдено — пустой список, а не выдумка", () => {
  assert.deepEqual(searchFoodReference("хурма"), []);
});

test("у каждого продукта справочника опознаётся категория", () => {
  // Значок рядом со строкой поиска берётся из lib/food-category.ts. Если
  // продукт не опознан, человек увидит безликую тарелку — терпимо, но таких
  // не должно быть много.
  const unknown = FOOD_REFERENCE.filter((food) => foodCategory(food.name) === "other");
  assert.ok(
    unknown.length === 0,
    `не опознаны: ${unknown.map((f) => f.name).join(", ")}`,
  );
});

test("крупы и макароны даны в отварном виде", () => {
  // Сухая гречка — 340 ккал, отварная — 110. Перепутать значит ошибиться
  // втрое, поэтому проверяем прямо: у круп в названии есть признак готовки,
  // а калорийность не выше 200 на 100 г.
  for (const name of ["Гречка отварная", "Рис белый отварной", "Макароны отварные", "Овсянка на воде"]) {
    const food = FOOD_REFERENCE.find((f) => f.name === name);
    assert.ok(food, `нет продукта «${name}»`);
    assert.ok(food.kcal < 200, `${name}: ${food.kcal} ккал — похоже на сухую крупу, а не на отварную`);
  }
});

test("числа с упаковки: запятая, пустое поле, мусор, минус", () => {
  assert.equal(parseNutrient("12.5", 100), 12.5);
  // На телефоне цифровая клавиатура даёт запятую, а не точку.
  assert.equal(parseNutrient("12,5", 100), 12.5);
  assert.equal(parseNutrient("  7 ", 100), 7);
  // Прочерк в строке клетчатки на упаковке означает ноль, а не «не знаю».
  assert.equal(parseNutrient("", 100), 0);
  assert.equal(parseNutrient("—", 100), 0);
  assert.equal(parseNutrient("много", 100), 0);
  // Отрицательной калорийности не бывает — это опечатка, а не ввод.
  assert.equal(parseNutrient("-5", 100), 0);
});

test("числа с упаковки обрезаются по потолку, а не отвергаются", () => {
  // Промах на разряд (170 г белка вместо 17) не должен ни ронять форму, ни
  // утекать в базу: форма с одним подсвеченным полем на середине ввода
  // раздражает сильнее, чем срезанное число, которое видно сразу.
  assert.equal(parseNutrient("170", 100), 100);
  assert.equal(parseNutrient("9000", 900), 900);
  assert.equal(parseNutrient("100", 100), 100);
});

test("потолки формы не выше тех, что примет сервер", () => {
  // lib/meals.ts клампит клетчатку до 50 на 100 г, остальное — до 100 (вес до
  // 3000, калорийность до 900). Если форма разрешит больше, человек увидит на
  // экране одно число, а в дневнике окажется другое.
  assert.equal(parseNutrient("80", 50), 50);
  for (const food of FOOD_REFERENCE) {
    assert.ok(food.fiber <= 50, `${food.name}: клетчатки больше серверного потолка`);
  }
});

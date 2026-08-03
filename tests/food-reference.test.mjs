import assert from "node:assert/strict";
import { test } from "node:test";
import { DISHES } from "../lib/dishes.ts";
import { foodCategory } from "../lib/food-category.ts";
import { FOOD_REFERENCE, searchFoodReference } from "../lib/food-reference.ts";
import { atwaterKcal } from "../lib/nutrition-sanity.ts";

/**
 * Главная проверка справочника — сходимость по Атуотеру. Опечатка в разряде
 * (170 вместо 17 г белка) так не проходит, а именно она и есть самая
 * вероятная ошибка в таблице чисел.
 *
 * Считаем той же функцией, что и весь остальной код (`atwaterKcal` из
 * lib/nutrition-sanity.ts), а не своей копией формулы. Копия была и
 * расходилась с оригиналом в одном слагаемом: она не давала клетчатке
 * никакой энергии, тогда как везде в проекте клетчатка идёт по 2 ккал/г —
 * так же, как её считает системный промпт разбора.
 *
 * Расхождение било по всему, где клетчатки много: малина, чечевица, капуста
 * не проходили проверку с верными числами, и справочник поэтому оставался
 * бедным на овощи и ягоды.
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
    // Спирт передаём тот, что заявлен у продукта: у пива и вина энергия
    // идёт почти целиком из него, и с нулём здесь проверка объявляла бы
    // верные числа ошибкой.
    const computed = atwaterKcal({ ...food, alcohol: food.alcohol ?? 0 });
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

  // «Греческий» стоит вторым словом сразу у нескольких позиций, и какая из
  // них окажется первой — вопрос длины названия, а не правильности. Важно
  // другое: наверх не должна вылезти «Гречка», у которой с запросом общие
  // только четыре буквы корня.
  const byMiddle = searchFoodReference("греческ");
  assert.ok(/греческ/i.test(byMiddle[0].name), `первым ожидали греческое, получили ${byMiddle[0]?.name}`);
  assert.ok(byMiddle.some((f) => f.name === "Йогурт греческий 2%"), "греческий йогурт должен найтись");
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
  // Маракуйя в справочнике не значится, и ни с одним названием у неё нет
  // общего корня. Подсказка должна остаться пустой: пусть человек внесёт
  // числа руками, чем получит похожий по буквам, но чужой продукт.
  assert.deepEqual(searchFoodReference("маракуйя"), []);
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

/**
 * Одно и то же блюдо не может показывать на публичной странице «сколько
 * калорий» одно, а в дневнике — другое. Числа справочника обязаны лежать
 * внутри опубликованных диапазонов.
 *
 * Связь по названию, а не по отдельному полю-ссылке: поле пришлось бы
 * заполнять руками при каждом новом блюде, и первое же забытое оставило бы
 * расхождение незамеченным. Название и так совпадает — оно одно и то же
 * блюдо.
 */
test("числа блюд не расходятся с публичными страницами", () => {
  // Название в справочнике бывает уточнённым: «Солянка мясная», «Салат
  // «Цезарь» с курицей». Сопоставляем по вхождению основы.
  const key = (value) => value.toLowerCase().replace(/ё/g, "е").replace(/[«»"]/g, "");

  let checked = 0;
  for (const dish of DISHES) {
    const food = FOOD_REFERENCE.find((item) => key(item.name).startsWith(key(dish.name)));
    if (!food) continue;
    checked += 1;
    for (const [field, range] of [
      ["kcal", dish.kcal], ["protein", dish.protein], ["fat", dish.fat], ["carbs", dish.carbs],
    ]) {
      const [min, max] = range;
      assert.ok(
        food[field] >= min && food[field] <= max,
        `${food.name}: ${field} = ${food[field]}, а на странице /skolko-kalorij/${dish.slug} заявлено ${min}–${max}`,
      );
    }
  }
  // Проверка бессмысленна, если совпадений не нашлось вовсе: тогда она
  // молча проходит на пустом множестве и ничего не сторожит.
  assert.ok(checked >= 5, `сопоставилось всего ${checked} блюд — проверка ничего не сторожит`);
});

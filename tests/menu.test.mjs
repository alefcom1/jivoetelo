import test from "node:test";
import assert from "node:assert/strict";
import {
  FILTER_LABELS,
  MAX_TARGET,
  MEAL_SLOTS,
  MIN_TARGET,
  RATIONS,
  SLOT_SHARE,
  buildDay,
  rationsFor,
  shoppingList,
  sumItems,
} from "../lib/menu.ts";
import { FOOD_REFERENCE } from "../lib/food-reference.ts";
import { foodCategory } from "../lib/food-category.ts";

/**
 * Меню на день.
 *
 * Тесты написаны по дефектам, найденным у западного планировщика, который и
 * стал поводом сделать свой: там БЖУ не сходились с калорийностью в два с
 * половиной раза, план недобирал до цели 8% молча, а при выбранном
 * «вегетарианском» режиме в меню попадала курица. Каждая из этих трёх
 * поломок здесь закрыта отдельной проверкой.
 */

const KNOWN = new Map(FOOD_REFERENCE.map((food) => [food.name, food]));

/* ===== Данные рационов ===== */

test("каждая позиция рациона есть в справочнике", () => {
  // Без этого опечатка в названии даёт не ошибку, а рацион с нулевыми
  // калориями — и день молча недобирает до цели.
  for (const ration of RATIONS) {
    for (const item of ration.items) {
      assert.ok(KNOWN.has(item.name), `«${ration.title}»: «${item.name}» нет в справочнике`);
      assert.ok(item.grams > 0 && item.grams <= 500, `«${ration.title}»: ${item.name} — ${item.grams} г`);
    }
  }
});

test("идентификаторы уникальны, у каждого слота хватает вариантов", () => {
  const ids = RATIONS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "повтор id рациона");
  for (const slot of MEAL_SLOTS) {
    const count = RATIONS.filter((r) => r.slot === slot).length;
    assert.ok(count >= 10, `в слоте «${slot}» всего ${count} рационов — меню будет повторяться`);
  }
});

test("рацион — это связка, а не одинокий продукт", () => {
  for (const ration of RATIONS) {
    assert.ok(ration.items.length >= 1, `«${ration.title}» пустой`);
    assert.ok(ration.title.length > 8, `«${ration.title}» — слишком короткое название`);
    // Приёмы пищи, кроме перекуса, из одной позиции не состоят.
    if (ration.slot !== "snack") {
      assert.ok(ration.items.length >= 2, `«${ration.title}»: полноценный приём пищи из одной позиции`);
    }
  }
});

test("калорийность рациона правдоподобна для своего слота", () => {
  for (const ration of RATIONS) {
    const { kcal } = sumItems(ration.items);
    if (ration.slot === "snack") {
      assert.ok(kcal >= 100 && kcal <= 450, `«${ration.title}»: перекус на ${kcal} ккал`);
    } else {
      assert.ok(kcal >= 250 && kcal <= 900, `«${ration.title}»: приём пищи на ${kcal} ккал`);
    }
  }
});

test("метки поставлены честно: «без мяса» — без мяса и рыбы", () => {
  // Ровно тот дефект, который мы видели у конкурента: фильтр выбран, а
  // курица в плане. Здесь метка сверяется с составом.
  for (const ration of RATIONS) {
    const names = ration.items.map((item) => item.name);
    if (ration.tags.includes("noMeat")) {
      const meaty = names.filter(isMeat);
      assert.equal(meaty.length, 0, `«${ration.title}» помечен «без мяса», а в составе: ${meaty.join(", ")}`);
    }
    if (ration.tags.includes("noDairy")) {
      const dairy = names.filter((name) => foodCategory(name) === "dairy");
      assert.equal(dairy.length, 0, `«${ration.title}» помечен «без молочного», а в составе: ${dairy.join(", ")}`);
    }
  }
});

/**
 * Мясо это или нет — решаем по категории справочника, а не по строке.
 *
 * Первая версия проверки искала «курин» в названии и объявляла мясом «Яйцо
 * куриное». Категория такой ошибки не делает, но и её одной мало: у составных
 * блюд она берётся по основе, и «Плов с курицей» числится крупой. Поэтому
 * категория плюс явная проверка названия на мясную начинку.
 */
function isMeat(name) {
  const category = foodCategory(name);
  if (category === "egg") return false;
  if (["poultry", "meat", "fish", "fastfood"].includes(category)) return true;
  return /куриц|курин|говяж|свин|мясн|индейк|рыбн|по-флотски/i.test(name);
}

test("любое сочетание ограничений оставляет хотя бы один вариант в каждом слоте", () => {
  // Иначе человек выбирает два фильтра и получает пустой день без объяснения.
  const filters = Object.keys(FILTER_LABELS);
  for (const a of filters) {
    for (const b of filters) {
      const pair = a === b ? [a] : [a, b];
      for (const slot of MEAL_SLOTS) {
        assert.ok(
          rationsFor(slot, pair).length > 0,
          `${pair.join(" + ")}: в слоте «${slot}» не осталось ни одного рациона`,
        );
      }
    }
  }
});

/* ===== Сборка дня ===== */

test("в рабочем диапазоне день попадает в цель с точностью до 5%", () => {
  // 1200–2600 ккал — то, ради чего страница и сделана. Здесь набор обязан
  // попадать в цель при любых ограничениях.
  const combos = [[], ["noMeat"], ["noDairy"], ["quick"], ["cheap"], ["noMeat", "noDairy"], ["quick", "cheap"]];
  for (let target = 1200; target <= 2600; target += 100) {
    for (const filters of combos) {
      const day = buildDay(target, filters);
      assert.equal(day.missing.length, 0, `${target} + ${filters}: слот остался без рациона`);
      assert.ok(
        Math.abs(day.deviation) <= 5,
        `${target} ккал (${filters.join("+") || "без ограничений"}): расхождение ${day.deviation}%`,
      );
    }
  }
});

test("расхождение считается по фактическим числам, а не живёт отдельно", () => {
  // Главный принцип: даже когда набор не дотянулся до цели, показанная
  // цифра расхождения обязана быть настоящей. Молчаливый недобор на 8,5% —
  // ровно то, за что мы критикуем чужой планировщик.
  const combos = [[], ["noMeat"], ["quick", "cheap"]];
  for (let target = 1200; target <= 3500; target += 100) {
    for (const filters of combos) {
      const day = buildDay(target, filters);
      const real = Math.round(((day.total.kcal - day.targetKcal) / day.targetKcal) * 1000) / 10;
      assert.equal(day.deviation, real, `${target} + ${filters}: показанное расхождение неверно`);
    }
  }
});

test("все четыре приёма пищи на месте, добавочные — только сверху", () => {
  const day = buildDay(2000, []);
  for (const slot of MEAL_SLOTS) {
    assert.ok(day.meals.some((meal) => meal.slot === slot && !meal.extra), `нет приёма пищи «${slot}»`);
  }
  assert.equal(day.meals.filter((meal) => meal.extra).length, 0, "на 2000 ккал добавочные перекусы не нужны");

  // На высокой калорийности добираем приёмами пищи, а не размером тарелки.
  const big = buildDay(3200, []);
  assert.ok(big.meals.filter((meal) => meal.extra).length > 0, "на 3200 ккал должен появиться добавочный перекус");
  assert.ok(big.meals.length <= 8, `приёмов пищи ${big.meals.length} — это уже не день, а список`);
});

test("сумма приёмов пищи равна итогу дня", () => {
  // У конкурента итог плана (2288) не сходился ни с целью, ни с заявленными
  // макронутриентами. Здесь итог — это в точности сумма частей.
  const day = buildDay(2200, []);
  const sum = day.meals.reduce((acc, meal) => acc + meal.nutrients.kcal, 0);
  assert.equal(day.total.kcal, sum);

  const protein = day.meals.reduce((acc, meal) => acc + meal.nutrients.protein, 0);
  assert.ok(Math.abs(day.total.protein - protein) < 0.5, "белок в итоге не равен сумме приёмов пищи");
});

test("БЖУ сходится с калорийностью — главная поломка чужих планировщиков", () => {
  // 4 ккал на грамм белка и углеводов, 9 на грамм жира. Допуск 8%: в
  // справочнике КБЖУ округлены, и точного равенства не бывает ни у кого.
  for (const target of [1500, 2000, 2800]) {
    const day = buildDay(target, []);
    const fromMacros = day.total.protein * 4 + day.total.fat * 9 + day.total.carbs * 4;
    const diff = Math.abs(fromMacros - day.total.kcal) / day.total.kcal;
    assert.ok(diff < 0.08, `${target} ккал: по БЖУ выходит ${Math.round(fromMacros)}, в итоге ${day.total.kcal}`);
  }
});

test("белок остаётся в человеческих пределах", () => {
  // У конкурента для 2500 ккал было заявлено 500 г белка — семь граммов на
  // килограмм веса. Проверяем, что наш день не уходит в такую зону.
  for (const target of [1400, 2000, 3000]) {
    const day = buildDay(target, []);
    const share = (day.total.protein * 4) / day.total.kcal;
    assert.ok(share > 0.1 && share < 0.45, `${target} ккал: белок даёт ${Math.round(share * 100)}% калорийности`);
  }
});

test("выбранное ограничение действительно применяется", () => {
  const day = buildDay(2000, ["noMeat"]);
  assert.equal(day.missing.length, 0);
  for (const meal of day.meals) {
    const meaty = meal.items.map((i) => i.name).filter(isMeat);
    assert.equal(meaty.length, 0, `при «без мяса» в «${meal.ration.title}» попало: ${meaty.join(", ")}`);
  }
  // И то же для молочного — фильтры не должны работать через один.
  const noDairy = buildDay(2000, ["noDairy"]);
  for (const meal of noDairy.meals) {
    const dairy = meal.items.map((i) => i.name).filter((n) => foodCategory(n) === "dairy");
    assert.equal(dairy.length, 0, `при «без молочного» в «${meal.ration.title}» попало: ${dairy.join(", ")}`);
  }
});

test("замена блюда меняет только свой приём пищи", () => {
  const first = buildDay(2000, []);
  const second = buildDay(2000, [], { lunch: 1 });
  assert.notEqual(
    second.meals.find((m) => m.slot === "lunch").ration.id,
    first.meals.find((m) => m.slot === "lunch").ration.id,
    "«заменить» не сменило обед",
  );
  for (const slot of ["breakfast", "dinner", "snack"]) {
    assert.equal(
      second.meals.find((m) => m.slot === slot).ration.id,
      first.meals.find((m) => m.slot === slot).ration.id,
      `замена обеда задела «${slot}»`,
    );
  }
});

test("сборка детерминирована — иначе разъедется гидратация", () => {
  // Страница рендерится на сервере и повторно в браузере. Случайность внутри
  // сборки дала бы разную разметку и предупреждение React о несовпадении.
  for (let i = 0; i < 5; i += 1) {
    const a = buildDay(2100, ["cheap"], { breakfast: 3, lunch: 2 });
    const b = buildDay(2100, ["cheap"], { breakfast: 3, lunch: 2 });
    assert.deepEqual(a.meals.map((m) => m.ration.id), b.meals.map((m) => m.ration.id));
    assert.equal(a.total.kcal, b.total.kcal);
  }
});

test("номер блюда закольцовывается, а не выходит за список", () => {
  const day = buildDay(2000, [], { lunch: 999 });
  assert.ok(day.meals.find((m) => m.slot === "lunch"), "большой номер уронил обед");
  const negative = buildDay(2000, [], { lunch: -3 });
  assert.ok(negative.meals.find((m) => m.slot === "lunch"), "отрицательный номер уронил обед");
});

test("порции остаются съедобными на краях калорийности", () => {
  // Подгонка ограничена: 1000 ккал в день не должны превращать ужин в
  // ложку гречки, а 5000 — в тройную порцию.
  for (const target of [MIN_TARGET, MAX_TARGET]) {
    const day = buildDay(target, []);
    for (const meal of day.meals) {
      assert.ok(meal.factor >= 0.65 && meal.factor <= 1.6, `${target} ккал: множитель ${meal.factor}`);
      for (const item of meal.items) {
        assert.ok(item.grams >= 5, `${item.name}: ${item.grams} г — это не порция`);
      }
    }
  }
});

test("нелепая цель зажимается в рабочие границы", () => {
  assert.equal(buildDay(0, []).targetKcal, MIN_TARGET);
  assert.equal(buildDay(99999, []).targetKcal, MAX_TARGET);
  assert.equal(buildDay(-500, []).targetKcal, MIN_TARGET);
  assert.ok(buildDay(0, []).total.kcal > 0);
  assert.ok(MIN_TARGET >= 1200, "ниже 1200 ккал меню предлагать не следует — это зона врача");
});

test("доли приёмов пищи складываются в единицу", () => {
  const sum = MEAL_SLOTS.reduce((acc, slot) => acc + SLOT_SHARE[slot], 0);
  assert.ok(Math.abs(sum - 1) < 0.001, `доли дают ${sum}, а не 1 — день не попадёт в цель`);
});

/* ===== Список покупок ===== */

test("список покупок складывает одинаковые продукты за все дни", () => {
  const day = buildDay(2000, [], { breakfast: 0 });
  const list = shoppingList([day, day, day]);
  assert.ok(list.length > 0);

  // Каждая позиция дня обязана попасть в список, и втрое больше.
  const dayTotals = new Map();
  for (const meal of day.meals) {
    for (const item of meal.items) dayTotals.set(item.name, (dayTotals.get(item.name) ?? 0) + item.grams);
  }
  for (const [name, grams] of dayTotals) {
    const row = list.find((r) => r.name === name);
    assert.ok(row, `«${name}» потерялся в списке покупок`);
    assert.ok(Math.abs(row.grams - grams * 3) <= 5, `«${name}»: ${row.grams} г вместо ${grams * 3}`);
  }
  // Сортировка по убыванию: сверху то, чего покупать больше всего.
  for (let i = 1; i < list.length; i += 1) {
    assert.ok(list[i - 1].grams >= list[i].grams, "список не отсортирован");
  }
});

test("пустой список покупок не ломается", () => {
  assert.deepEqual(shoppingList([]), []);
});

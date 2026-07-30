import test from "node:test";
import assert from "node:assert/strict";
import { DISHES, DISH_CATEGORIES, findDish, midpoint, portionRange, relatedDishes } from "../lib/dishes.ts";

/**
 * Страницы блюд генерируются из этих данных, и ошибка в одной строке уезжает
 * прямо в поисковую выдачу. Проверяем не вёрстку, а то, из-за чего страница
 * стала бы врать: перевёрнутый диапазон, вариант вне собственных границ,
 * дублирующийся адрес.
 */

test("каждое блюдо описано полностью", () => {
  for (const dish of DISHES) {
    const where = dish.slug;
    assert.match(dish.slug, /^[a-z0-9-]+$/, `${where}: адрес только латиницей`);
    assert.ok(dish.name.length > 2, where);
    assert.match(dish.inDish, /^в /, `${where}: предложный падеж пишется вместе с предлогом`);
    assert.ok(DISH_CATEGORIES[dish.category], `${where}: неизвестная категория`);
    assert.ok(dish.summary.length > 40, `${where}: слишком короткое описание`);
    assert.ok(dish.drivers.length >= 3, `${where}: меньше трёх факторов — страница не оправдывает себя`);
    assert.ok(dish.variants.length >= 3, `${where}: нужно три варианта`);
    assert.ok(dish.portionG >= 50 && dish.portionG <= 600, `${where}: странная порция`);
    assert.ok(dish.portionLabel.length > 5, where);
  }
});

test("диапазоны не перевёрнуты и не выродились в точку", () => {
  for (const dish of DISHES) {
    for (const key of ["kcal", "protein", "fat", "carbs"]) {
      const [from, to] = dish[key];
      assert.ok(from < to, `${dish.slug}.${key}: ${from}–${to} — не диапазон`);
      assert.ok(from >= 0, `${dish.slug}.${key}: отрицательное значение`);
    }
    assert.ok(dish.kcal[1] / dish.kcal[0] <= 3, `${dish.slug}: диапазон шире чем втрое — такой ничего не сообщает`);
  }
});

test("варианты укладываются в собственный диапазон блюда", () => {
  for (const dish of DISHES) {
    for (const variant of dish.variants) {
      assert.ok(
        variant.kcal >= dish.kcal[0] && variant.kcal <= dish.kcal[1],
        `${dish.slug} / ${variant.label}: ${variant.kcal} вне ${dish.kcal[0]}–${dish.kcal[1]}`,
      );
    }
    const values = dish.variants.map((v) => v.kcal);
    assert.deepEqual(values, [...values].sort((a, b) => a - b), `${dish.slug}: варианты идут не по возрастанию`);
  }
});

test("калорийность сходится с белками, жирами и углеводами", () => {
  // Проверка Атуотера: 4 ккал на грамм белка и углеводов, 9 — на грамм жира.
  // Сходиться до килокалории она не обязана (клетчатка, погрешность округления),
  // но разойтись вдвое — значит, в данных опечатка.
  for (const dish of DISHES) {
    for (const edge of [0, 1]) {
      const atwater = dish.protein[edge] * 4 + dish.fat[edge] * 9 + dish.carbs[edge] * 4;
      const declared = dish.kcal[edge];
      const ratio = atwater / declared;
      assert.ok(
        ratio > 0.55 && ratio < 1.45,
        `${dish.slug}, граница ${edge}: заявлено ${declared} ккал, по составу выходит ${atwater}`,
      );
    }
  }
});

test("адреса уникальны — иначе страницы затрут друг друга", () => {
  const slugs = DISHES.map((d) => d.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const titles = DISHES.map((d) => d.inDish);
  assert.equal(new Set(titles).size, titles.length, "два блюда с одинаковым заголовком каннибализируют друг друга");
});

test("порция считается из ста граммов и не теряет порядок", () => {
  for (const dish of DISHES) {
    const [from, to] = portionRange(dish);
    assert.ok(from < to, dish.slug);
    assert.ok(Math.abs(from - (dish.kcal[0] * dish.portionG) / 100) <= 5, dish.slug);
    assert.ok(midpoint([from, to]) > from && midpoint([from, to]) < to, dish.slug);
  }
});

test("соседи по кластеру — сначала своя категория, и никогда сам себя", () => {
  for (const dish of DISHES) {
    const related = relatedDishes(dish);
    assert.equal(related.length, 3, dish.slug);
    assert.ok(!related.some((d) => d.slug === dish.slug), `${dish.slug} ссылается сам на себя`);
    const sameCategoryCount = DISHES.filter((d) => d.category === dish.category && d.slug !== dish.slug).length;
    for (let i = 0; i < Math.min(sameCategoryCount, 3); i++) {
      assert.equal(related[i].category, dish.category, `${dish.slug}: сосед ${i} не из своей категории`);
    }
  }
});

test("поиск по адресу находит блюдо и не выдумывает несуществующее", () => {
  assert.equal(findDish("borshch")?.name, "Борщ");
  assert.equal(findDish("нет-такого"), undefined);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { DISHES } from "../lib/dishes.ts";
import { FOOD_REFERENCE } from "../lib/food-reference.ts";
import {
  PRODUCTS,
  PRODUCT_META_NAMES,
  cookedFromRaw,
  findProduct,
  kcalFor,
  rawFromCooked,
} from "../lib/products.ts";

test("каждая карточка каталога находит продукт в справочнике", () => {
  // Переименование в food-reference молча оставило бы каталог без страницы.
  const names = new Set(FOOD_REFERENCE.map((food) => food.name));
  const orphans = PRODUCT_META_NAMES.filter((name) => !names.has(name));
  assert.deepEqual(orphans, [], `нет таких продуктов в справочнике: ${orphans.join(", ")}`);
  assert.equal(PRODUCTS.length, PRODUCT_META_NAMES.length);
});

test("состав не переписан, а взят из справочника", () => {
  // Две копии одного состава разошлись бы на первой правке, и разошлись бы молча.
  for (const product of PRODUCTS) {
    const source = FOOD_REFERENCE.find((food) => food.name === product.name);
    assert.equal(product.kcal, source.kcal, `${product.name}: калорийность разошлась`);
    assert.equal(product.protein, source.protein, `${product.name}: белок разошёлся`);
    assert.equal(product.portionG, source.portionG, `${product.name}: порция разошлась`);
  }
});

test("slug уникален и годится для адреса", () => {
  const seen = new Set();
  for (const product of PRODUCTS) {
    assert.match(product.slug, /^[a-z0-9-]+$/, `${product.name}: недопустимый slug «${product.slug}»`);
    assert.ok(!seen.has(product.slug), `дубль slug: ${product.slug}`);
    seen.add(product.slug);
    assert.equal(findProduct(product.slug)?.name, product.name);
  }
});

test("предложный падеж задан с предлогом", () => {
  // Из него собирается заголовок «Сколько калорий в твороге 5%». Без предлога
  // получится «Сколько калорий творог», и это увидит каждый посетитель.
  for (const product of PRODUCTS) {
    assert.match(product.inProduct, /^в/, `${product.name}: «${product.inProduct}» не начинается с предлога`);
  }
});

/**
 * Главная проверка каталога — та же по духу, что Атуотер у блюд.
 *
 * Сухая гречка 343 ккал, отварная 110: перепутать значит ошибиться втрое.
 * Числа для сухого вида и коэффициент разваривания заданы независимо, и если
 * они разъедутся, страница начнёт врать ровно в том месте, ради которого её
 * и делали. Поэтому сверяем: сухая калорийность, делённая на коэффициент,
 * обязана сойтись с отварной.
 */
test("сухое и варёное сходятся через коэффициент разваривания", () => {
  const withRaw = PRODUCTS.filter((product) => product.raw);
  assert.ok(withRaw.length >= 5, `продуктов с сухим видом всего ${withRaw.length}`);

  for (const product of withRaw) {
    const computed = product.raw.kcal / product.raw.ratio;
    const ratio = computed / product.kcal;
    assert.ok(
      ratio > 0.85 && ratio < 1.15,
      `${product.name}: ${product.raw.kcal} ккал сухой ÷ ${product.raw.ratio} = ${computed.toFixed(0)}, ` +
        `а отварной заявлен ${product.kcal} (отношение ${ratio.toFixed(2)})`,
    );
  }
});

test("коэффициент разваривания в разумных пределах", () => {
  for (const product of PRODUCTS.filter((p) => p.raw)) {
    assert.ok(
      product.raw.ratio > 1.5 && product.raw.ratio < 6,
      `${product.name}: коэффициент ${product.raw.ratio} не похож на правду`,
    );
    // Сухой продукт не может быть легче готового: вода добавляет вес, не калории.
    assert.ok(product.raw.kcal > product.kcal, `${product.name}: сухой легче отварного`);
  }
});

test("пересчёт сухое ↔ варёное обратим", () => {
  const grechka = findProduct("grechka");
  const cooked = cookedFromRaw(grechka, 100);
  assert.ok(cooked > 250 && cooked < 350, `100 г сухой гречки дали ${cooked} г готовой`);
  // Туда и обратно — с точностью до округления.
  assert.ok(Math.abs(rawFromCooked(grechka, cooked) - 100) <= 1);
});

test("у продукта без сухого вида пересчёт не выдумывается", () => {
  // Яблоко не варят, и отвечать на этот вопрос числом было бы враньём.
  const apple = findProduct("yabloko");
  assert.equal(cookedFromRaw(apple, 100), null);
  assert.equal(rawFromCooked(apple, 100), null);
});

test("бытовые меры заданы и правдоподобны", () => {
  // Ради них половина каталога и затевалась: весов у человека обычно нет.
  for (const product of PRODUCTS) {
    assert.ok(product.household.length > 0, `${product.name}: нет ни одной бытовой меры`);
    for (const measure of product.household) {
      assert.ok(measure.label.trim().length > 0, `${product.name}: пустая подпись меры`);
      assert.ok(
        measure.grams > 0 && measure.grams <= 400,
        `${product.name}: «${measure.label}» — ${measure.grams} г, это не бытовая мера`,
      );
    }
  }
});

test("что двигает цифру — заполнено, ради этого страница и существует", () => {
  for (const product of PRODUCTS) {
    assert.ok(product.drivers.length >= 2, `${product.name}: меньше двух причин разброса`);
    for (const driver of product.drivers) {
      assert.ok(driver.length > 20, `${product.name}: слишком короткое пояснение «${driver}»`);
    }
  }
});

test("ссылки на блюда ведут в существующий каталог", () => {
  const slugs = new Set(DISHES.map((dish) => dish.slug));
  for (const product of PRODUCTS) {
    for (const slug of product.dishSlugs) {
      assert.ok(slugs.has(slug), `${product.name}: нет блюда «${slug}»`);
    }
  }
});

test("калорийность порции считается от веса, а не от ста грамм", () => {
  const grechka = findProduct("grechka");
  assert.equal(kcalFor(grechka, 100), grechka.kcal);
  assert.equal(kcalFor(grechka, 180), Math.round((grechka.kcal * 180) / 100));
  assert.equal(kcalFor(grechka, 0), 0);
});

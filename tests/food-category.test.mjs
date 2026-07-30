import assert from "node:assert/strict";
import { test } from "node:test";
import { FOOD_CATEGORIES, foodCategory, foodCategoryInfo, mealCategory } from "../lib/food-category.ts";

/**
 * Названия здесь — это то, что реально возвращает разбор: не словарные формы,
 * а куски фраз с падежами и уточнениями. Тест на них и держит весь смысл
 * модуля: маппинг, который работает только на именительном падеже, бесполезен.
 */
const CASES = [
  // Птица и мясо
  ["куриная грудка на пару", "poultry"],
  ["филе индейки", "poultry"],
  ["говяжья котлета", "meat"],
  ["стейк из свинины", "meat"],
  ["варёная колбаса", "meat"],
  ["пельмени домашние", "meat"],

  // Рыба
  ["слабосолёная сёмга", "fish"],
  ["запечённая треска", "fish"],
  ["роллы «Филадельфия»", "fish"],

  // Яйца
  ["два варёных яйца", "egg"],
  ["омлет из трёх яиц", "egg"],
  ["яичница-глазунья", "egg"],

  // Молочное
  ["творог 5%", "dairy"],
  ["сырники со сметаной", "dairy"],
  ["греческий йогурт без добавок", "dairy"],
  ["сыр гауда", "dairy"],
  ["кефир 1%", "dairy"],

  // Крупы, паста, хлеб. «Гречка с курицей» — про гречку: значок показывает
  // то, чем блюдо названо, а не самую питательную его часть.
  ["гречка с курицей", "grain"],
  ["плов с бараниной", "grain"],
  ["гречневая каша", "grain"],
  ["овсянка на воде", "grain"],
  ["макароны твёрдых сортов", "grain"],
  ["бурый рис", "grain"],
  ["ржаной хлеб", "bread"],
  ["тост из цельнозернового хлеба", "bread"],
  ["блины с творогом", "bread"],

  // Овощи и картофель
  ["овощной салат", "vegetable"],
  ["салат с креветками", "vegetable"],
  ["свежие огурцы", "vegetable"],
  ["тушёная капуста", "vegetable"],
  ["брокколи на пару", "vegetable"],
  ["картофельное пюре", "potato"],
  ["картофель фри", "potato"],

  // Фрукты, орехи, бобовые
  ["яблоко зелёное", "fruit"],
  ["банан", "fruit"],
  ["горсть черники", "fruit"],
  ["миндаль жареный", "nuts"],
  ["арахисовая паста", "nuts"],
  ["нут отварной", "legume"],
  ["чечевичный суп", "soup"],

  // Супы
  ["борщ со сметаной", "soup"],
  ["куриный бульон", "soup"],
  ["крем-суп из тыквы", "soup"],

  // Сладкое, фастфуд, напитки, соусы
  ["молочный шоколад", "sweet"],
  ["кусок торта", "sweet"],
  ["овсяное печенье", "sweet"],
  ["чизбургер", "fastfood"],
  ["пицца пепперони", "fastfood"],
  ["шаурма с курицей", "fastfood"],
  ["капучино на овсяном молоке", "drink"],
  ["чёрный чай без сахара", "drink"],
  ["стакан сока", "drink"],
  ["оливковое масло", "sauce"],
  ["майонез", "sauce"],
];

test("названия блюд попадают в свою категорию", () => {
  for (const [name, expected] of CASES) {
    assert.equal(foodCategory(name), expected, `«${name}» → ожидали ${expected}`);
  }
});

/**
 * Ловушки, ради которых и заведено правило «побеждает самая длинная основа»:
 * одно слово начинается с основы совсем другой категории. Без этого правила
 * «печенье» становилось бы печенью, а «сливки» — сливами.
 */
test("длинная основа перебивает короткую", () => {
  assert.equal(foodCategory("сливки 10%"), "dairy");
  assert.equal(foodCategory("слива"), "fruit");
  assert.equal(foodCategory("маслины без косточки"), "vegetable");
  assert.equal(foodCategory("подсолнечное масло"), "sauce");
  assert.equal(foodCategory("курага"), "fruit");
  assert.equal(foodCategory("нутелла"), "sweet");
  assert.equal(foodCategory("рахат-лукум"), "sweet");
  assert.equal(foodCategory("репчатый лук"), "vegetable");
});

test("прилагательное не перетягивает значок на себя", () => {
  // «сырое» начинается с «сыр» — но блюдо называет существительное.
  assert.equal(foodCategory("сырое яйцо"), "egg");
  assert.equal(foodCategory("молочный шоколад"), "sweet");
  assert.equal(foodCategory("овсяное печенье"), "sweet");
  assert.equal(foodCategory("куриный бульон"), "soup");
  // Но ослабление именно слабое, а не отбрасывание: иначе арахисовая паста
  // стала бы обычной пастой.
  assert.equal(foodCategory("арахисовая паста"), "nuts");
});

test("уточнение после предлога не подменяет блюдо", () => {
  assert.equal(foodCategory("овсянка на воде"), "grain");
  assert.equal(foodCategory("блины с творогом"), "bread");
  assert.equal(foodCategory("борщ со сметаной"), "soup");
  assert.equal(foodCategory("шаурма с курицей"), "fastfood");
  // Если в голове названия еды нет вовсе — смотрим по всей строке.
  assert.equal(foodCategory("порция с курицей"), "poultry");
});

test("названный фрукт важнее посуды", () => {
  // Осознанное поведение, а не промах: у «апельсинового сока» значок
  // апельсина. Слово «сок» короче и проигрывает; переучивать не за чем —
  // апельсин на строке читается и понятнее, и ярче.
  assert.equal(foodCategory("апельсиновый сок"), "fruit");
});

test("ё и е — одно и то же", () => {
  assert.equal(foodCategory("свёкла"), foodCategory("свекла"));
  assert.equal(foodCategory("сёмга"), "fish");
  assert.equal(foodCategory("мёд"), "sweet");
});

test("непонятное не выдумывается", () => {
  assert.equal(foodCategory("нечто"), "other");
  assert.equal(foodCategory(""), "other");
  assert.equal(foodCategory("   "), "other");
  assert.equal(foodCategory("12345"), "other");
});

test("категория приёма пищи — по основному блюду, не по заправке", () => {
  assert.equal(mealCategory(["оливковое масло", "куриная грудка", "огурцы"]), "poultry");
  assert.equal(mealCategory(["кофе", "сырники", "сметана"]), "dairy");
  // Если ничего, кроме соуса и напитка, нет — берём первую позицию как есть.
  assert.equal(mealCategory(["чёрный чай"]), "drink");
  assert.equal(mealCategory([]), "other");
  assert.equal(mealCategory(["нечто непонятное"]), "other");
});

test("у каждой категории есть цвет и подпись", () => {
  const keys = new Set();
  for (const info of FOOD_CATEGORIES) {
    assert.ok(info.label.length > 0, `нет подписи у ${info.key}`);
    assert.ok(info.hue >= 0 && info.hue < 360, `тон вне диапазона у ${info.key}`);
    assert.ok(info.sat >= 0 && info.sat <= 100, `насыщенность вне диапазона у ${info.key}`);
    assert.ok(!keys.has(info.key), `дубль категории ${info.key}`);
    keys.add(info.key);
  }
  assert.ok(keys.has("other"), "нужна запасная категория other");
  assert.equal(foodCategoryInfo("other").key, "other");
});

test("любая категория из маппинга описана в палитре", () => {
  const described = new Set(FOOD_CATEGORIES.map((info) => info.key));
  for (const [name] of CASES) {
    assert.ok(described.has(foodCategory(name)), `категория для «${name}» не описана в палитре`);
  }
});

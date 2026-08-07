import test from "node:test";
import assert from "node:assert/strict";
import { applyClarification, refinedIndex } from "../lib/clarify.ts";

/**
 * Уточняющие вопросы.
 *
 * Тесты написаны по живой поломке: на вопрос «какой йогурт?» выбор
 * греческого дописывал его к списку, и в приёме пищи оказывалось два
 * йогурта — обычный и греческий, — а калорийность дня удваивалась. То же
 * происходило с любым вопросом, который не добавляет ингредиент, а называет
 * уже найденный точнее.
 */

const item = (name, kcal = 100) => ({ name, estimatedGrams: 150, per100g: { kcal } });

/* ===== Та самая поломка ===== */

test("уточнение йогурта заменяет позицию, а не добавляет вторую", () => {
  const items = [item("Дыня"), item("Йогурт")];
  const question = {
    question: "Какой йогурт?",
    options: [{ label: "Обычный" }, { label: "Греческий", addItem: item("Йогурт греческий", 99) }],
  };

  const next = applyClarification(items, question, 1);
  assert.equal(next.length, 2, `стало ${next.length} позиций: ${next.map((i) => i.name).join(", ")}`);
  assert.deepEqual(next.map((i) => i.name), ["Дыня", "Йогурт греческий"]);
});

test("явный refinesIndex от модели важнее догадки по названию", () => {
  // Здесь названия не пересекаются вовсе, и без подсказки модели заменять
  // было бы нечего: «на каком масле жарили» уточняет саму котлету.
  const items = [item("Гречка"), item("Котлета")];
  const question = {
    question: "Котлета жареная или паровая?",
    refinesIndex: 1,
    options: [{ label: "Паровая", addItem: item("Котлета паровая") }, { label: "Жареная" }],
  };

  const next = applyClarification(items, question, 0);
  assert.deepEqual(next.map((i) => i.name), ["Гречка", "Котлета паровая"]);
});

/* ===== Добавление осталось добавлением ===== */

test("вопрос про заправку по-прежнему добавляет позицию", () => {
  const items = [item("Салат овощной")];
  const question = {
    question: "Была ли заправка?",
    options: [{ label: "Без заправки" }, { label: "Оливковое масло", addItem: item("Масло оливковое", 884) }],
  };

  const next = applyClarification(items, question, 1);
  assert.equal(next.length, 2);
  assert.deepEqual(next.map((i) => i.name), ["Салат овощной", "Масло оливковое"]);
});

test("вариант без addItem не трогает список", () => {
  const items = [item("Суп")];
  const question = { question: "Со сметаной?", options: [{ label: "Без сметаны" }, { label: "Со сметаной", addItem: item("Сметана") }] };
  assert.deepEqual(applyClarification(items, question, 0), items);
});

/* ===== Правило совпадения по названию ===== */

test("замена — только по началу названия и по границе слова", () => {
  const items = [item("Йогурт"), item("Сок"), item("Масло оливковое")];

  // Уточнение: начинается с исходного названия плюс новое слово.
  assert.equal(refinedIndex(items, item("Йогурт греческий")), 0);
  // Не уточнение: «Сокол» начинается с «сок», но это другое слово целиком.
  assert.equal(refinedIndex(items, item("Сокол")), -1, "совпадение без границы слова — не уточнение");
  // Не уточнение: ни одно название не начинается с другого.
  assert.equal(refinedIndex(items, item("Масло сливочное")), -1, "два разных масла — две позиции");
  // Совсем чужое.
  assert.equal(refinedIndex(items, item("Хлеб")), -1);
});

test("точное совпадение названия — это замена", () => {
  // Модель переоценила граммовку той же позиции: две одинаковые строки в
  // приёме пищи не нужны никогда.
  const items = [item("Йогурт греческий")];
  assert.equal(refinedIndex(items, item("Йогурт греческий", 99)), 0);
  assert.equal(refinedIndex(items, item("ЙОГУРТ ГРЕЧЕСКИЙ")), 0, "регистр не различие");
});

test("ё и е — одно и то же название", () => {
  // Случай настоящий: свёклу пишут и через ё, и через е, причём в одном
  // разборе модель может выдать оба написания.
  assert.equal(refinedIndex([item("Свёкла")], item("Свекла")), 0);
  assert.equal(refinedIndex([item("Свекла")], item("Свёкла отварная")), 0);
});

test("при нескольких подходящих берётся самое длинное совпадение", () => {
  // «Йогурт» и «Йогурт греческий» оба подходят под «Йогурт греческий 2%»;
  // заменять надо более конкретный, иначе останется дубль.
  const items = [item("Йогурт"), item("Йогурт греческий")];
  assert.equal(refinedIndex(items, item("Йогурт греческий 2%")), 1);
});

/* ===== Устойчивость ===== */

test("негодный refinesIndex игнорируется, а не теряет позицию", () => {
  const items = [item("Каша")];
  for (const bad of [5, -1, 1.5, NaN]) {
    const question = {
      question: "?",
      refinesIndex: bad,
      options: [{ label: "да", addItem: item("Мёд") }, { label: "нет" }],
    };
    const next = applyClarification(items, question, 0);
    assert.equal(next.length, 2, `refinesIndex=${bad}: список стал длиной ${next.length}`);
    assert.equal(next[0].name, "Каша", `refinesIndex=${bad}: исходная позиция пропала`);
  }
});

test("несуществующий номер варианта ничего не ломает", () => {
  const items = [item("Каша")];
  const question = { question: "?", options: [{ label: "а" }, { label: "б" }] };
  assert.deepEqual(applyClarification(items, question, 9), items);
});

test("исходный массив не меняется", () => {
  const items = [item("Йогурт")];
  const copy = [...items];
  applyClarification(items, {
    question: "?",
    options: [{ label: "греческий", addItem: item("Йогурт греческий") }],
  }, 0);
  assert.deepEqual(items, copy, "функция изменила переданный список");
});

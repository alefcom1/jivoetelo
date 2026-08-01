import assert from "node:assert/strict";
import { test } from "node:test";
import {
  foodScore,
  looksLikeFood,
  softmax,
  CONTEXT_CLASSES,
  FOOD_CLASSES,
  FOOD_THRESHOLD,
} from "../lib/food-presence.ts";

/**
 * Разбор выхода классификатора. Саму модель тесты не трогают: её проверяет
 * scripts/food-probe.mjs на настоящих фотографиях, и по-другому её проверить
 * нельзя — «узнаёт ли она еду» это вопрос к весам, а не к коду.
 *
 * Здесь проверяется то, что от кода зависит: правильно ли складываются
 * вероятности, не переполняется ли softmax и не попало ли в список съедобного
 * что-нибудь несъедобное.
 */

/** Вектор из тысячи нулей с заданными вероятностями. */
function probs(entries) {
  const out = new Float32Array(1000);
  for (const [index, value] of entries) out[index] = value;
  return out;
}

test("softmax даёт вероятности, а не логиты", () => {
  const result = softmax([1, 2, 3]);
  const sum = result.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `сумма ${sum}`);
  assert.ok(result[2] > result[1] && result[1] > result[0]);
});

test("softmax не переполняется на больших логитах", () => {
  // Без вычитания максимума exp(1000) обращается в бесконечность, и весь
  // вектор становится NaN — а наружу это вышло бы как «еды не видно» всегда.
  const result = softmax([1000, 1001, 999]);
  assert.ok(result.every((v) => Number.isFinite(v)), [...result].join(", "));
  assert.ok(Math.abs(result.reduce((a, b) => a + b, 0) - 1) < 1e-6);
});

test("уверенное блюдо набирает высокий счёт", () => {
  // 963 — pizza. Сравнение с допуском: Float32Array хранит 0.9 неточно.
  assert.ok(Math.abs(foodScore(probs([[963, 0.9]])) - 0.9) < 1e-6);
  assert.ok(looksLikeFood(probs([[963, 0.9]])));
});

test("счёт складывается из нескольких классов", () => {
  // Ровно это и делает детектор полезным: борщ модель дробит между consomme
  // и soup bowl, и ни один класс в одиночку порога не берёт.
  const spread = probs([[925, 0.08], [809, 0.1], [923, 0.06]]);
  assert.ok(!looksLikeFood(probs([[925, 0.08]])), "один класс из трёх — мало");
  assert.ok(looksLikeFood(spread), `вместе должно хватить, вышло ${foodScore(spread)}`);
});

test("посуда весит вдвое меньше самой еды", () => {
  // Пустая тарелка тоже даёт высокий отклик — принимать по ней решение
  // в одиночку нельзя.
  const food = foodScore(probs([[963, 0.4]]));
  const dishes = foodScore(probs([[923, 0.4]]));
  assert.ok(Math.abs(food - 0.4) < 1e-6);
  assert.ok(Math.abs(dishes - 0.2) < 1e-6, `посуда дала ${dishes}`);
});

test("посторонний кадр счёта не набирает", () => {
  // 207 — золотистый ретривер, 850 — плюшевый мишка.
  assert.equal(foodScore(probs([[207, 0.95], [850, 0.05]])), 0);
  assert.ok(!looksLikeFood(probs([[207, 0.99]])));
});

test("счёт не выходит за единицу", () => {
  // Иначе шкала на экране однажды нарисовала бы больше ста процентов.
  const everything = new Float32Array(1000).fill(0.5);
  assert.ok(foodScore(everything) <= 1);
});

test("сено и жёлудь в съедобное не попали", () => {
  // 958 — hay, 988 — acorn. Оба лежат внутри «съедобного» блока ImageNet и
  // оба попадали в список при отборе по ключевым словам.
  assert.ok(!FOOD_CLASSES.includes(958));
  assert.ok(!FOOD_CLASSES.includes(988));
});

test("списки не пересекаются и лежат внутри тысячи классов", () => {
  const food = new Set(FOOD_CLASSES);
  for (const index of CONTEXT_CLASSES) {
    assert.ok(!food.has(index), `${index} попал в оба списка — его вес удвоится`);
  }
  for (const index of [...FOOD_CLASSES, ...CONTEXT_CLASSES]) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < 1000, `${index} вне диапазона`);
  }
  assert.equal(new Set(FOOD_CLASSES).size, FOOD_CLASSES.length, "повторы в списке еды");
});

test("порог лежит между тем, что мы намерили", () => {
  // Замер scripts/food-probe.mjs: посторонние кадры давали до 11%, снимки
  // еды — от 24%. Порог должен оставаться внутри этого разрыва; выйдя за
  // его край, он бы сломал одну из двух групп разом.
  assert.ok(FOOD_THRESHOLD > 0.111, `порог ${FOOD_THRESHOLD} задевает посторонние кадры`);
  assert.ok(FOOD_THRESHOLD < 0.236, `порог ${FOOD_THRESHOLD} отсекает настоящую еду`);
});

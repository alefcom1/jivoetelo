import test from "node:test";
import assert from "node:assert/strict";
import {
  CALCULATOR_SOURCES,
  DISH_SOURCE_PREFIX,
  dishSubscribeSource,
  isKnownSubscribeSource,
} from "../lib/subscribe-source.ts";

/**
 * Источник подписки приходит скрытым полем формы, то есть от клиента — тот
 * же принцип, что и у чисел расчёта: проверяется заново на сервере, а не
 * принимается на слово. Модуль чистый (не трогает БД), поэтому здесь
 * проверяется напрямую, а не через lib/email-subscribe.ts.
 */

test("источники калькуляторов из фиксированного списка признаются известными", () => {
  for (const source of CALCULATOR_SOURCES) {
    assert.ok(isKnownSubscribeSource(source), source);
  }
});

test("источник блюда действителен только для блюда, которое реально существует", () => {
  assert.ok(isKnownSubscribeSource(`${DISH_SOURCE_PREFIX}borshch`));
  assert.ok(!isKnownSubscribeSource(`${DISH_SOURCE_PREFIX}нет-такого-блюда`));
});

test("dishSubscribeSource и распознавание источника блюда согласованы", () => {
  // Слаг, который сама функция считает валидным блюдом, должен пройти и
  // проверку источника — иначе форма страницы блюда подписывала бы людей с
  // источником, который сервер сам же потом отбраковывает.
  assert.ok(isKnownSubscribeSource(dishSubscribeSource("borshch")));
});

test("произвольная строка источником не считается", () => {
  assert.ok(!isKnownSubscribeSource(""));
  assert.ok(!isKnownSubscribeSource("raschet_energiya "));
  assert.ok(!isKnownSubscribeSource("RASCHET_ENERGIYA"));
  assert.ok(!isKnownSubscribeSource("что угодно"));
  // Префикс без слага — тоже не блюдо.
  assert.ok(!isKnownSubscribeSource(DISH_SOURCE_PREFIX));
});

test("источник калькулятора не спутать с похожей строкой блюда", () => {
  // Совпадение по префиксу без двоеточия не должно засчитываться источником
  // блюда — иначе достаточно опечатки, чтобы обойти проверку.
  assert.ok(!isKnownSubscribeSource("skolko_kalorij"));
  assert.ok(!isKnownSubscribeSource("skolko_kalorijborshch"));
});

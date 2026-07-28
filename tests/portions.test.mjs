import test from "node:test";
import assert from "node:assert/strict";
import { scaleGrams } from "../lib/portions.ts";

test("scaleGrams умножает вес на множитель", () => {
  assert.equal(scaleGrams(200, 1.5), 300);
  assert.equal(scaleGrams(200, 2), 400);
});

test("scaleGrams округляет дробный результат до целых граммов", () => {
  assert.equal(scaleGrams(133, 0.75), 100);
});

test("scaleGrams не даёт весу упасть ниже 1 г", () => {
  assert.equal(scaleGrams(1, 0.5), 1);
});

test("scaleGrams зажимает вес сверху в 3000 г", () => {
  assert.equal(scaleGrams(2000, 2), 3000);
});

test("scaleGrams при некорректном входе возвращает 1", () => {
  assert.equal(scaleGrams(NaN, 2), 1);
});

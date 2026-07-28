import test from "node:test";
import assert from "node:assert/strict";
import { pluralRu, withPluralRu } from "../lib/plural.ts";

const PHOTO = ["фото", "фото", "фото"];
const WAIT = ["ждёт", "ждут", "ждут"];
const DAY = ["день", "дня", "дней"];

test("единственное число только у настоящих единиц", () => {
  assert.equal(pluralRu(1, DAY), "день");
  assert.equal(pluralRu(21, DAY), "день");
  assert.equal(pluralRu(101, DAY), "день");
});

test("11–14 ведут себя как «много», хотя оканчиваются на 1–4", () => {
  for (const n of [11, 12, 13, 14, 111, 112, 113, 114]) {
    assert.equal(pluralRu(n, DAY), "дней", `${n}`);
  }
});

test("2–4 дают вторую форму", () => {
  for (const n of [2, 3, 4, 22, 23, 24, 102]) {
    assert.equal(pluralRu(n, DAY), "дня", `${n}`);
  }
});

test("0 и 5–9 дают третью форму", () => {
  for (const n of [0, 5, 6, 7, 8, 9, 10, 20, 25, 100]) {
    assert.equal(pluralRu(n, DAY), "дней", `${n}`);
  }
});

test("несклоняемое слово остаётся одинаковым, а глагол при нём — нет", () => {
  assert.equal(withPluralRu(1, PHOTO), "1 фото");
  assert.equal(pluralRu(1, WAIT), "ждёт");
  assert.equal(withPluralRu(5, PHOTO), "5 фото");
  assert.equal(pluralRu(5, WAIT), "ждут");
});

test("дробные и отрицательные не ломают правило", () => {
  assert.equal(pluralRu(1.7, DAY), "день");
  assert.equal(pluralRu(-3, DAY), "дня");
});

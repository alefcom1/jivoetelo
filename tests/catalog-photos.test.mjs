import assert from "node:assert/strict";
import { test } from "node:test";
import { PHOTO_CREDIT, PHOTO_STATUSES, buildCaption } from "../lib/catalog-photos.ts";

/**
 * Подпись попадает разом в четыре места: `alt`, `title`, видимую строку под
 * снимком и `ImageObject.caption`. То есть её читают и человек, и поисковик,
 * и она обязана описывать ровно то, что на снимке.
 */

test("подпись называет продукт и вес порции", () => {
  assert.equal(buildCaption("Творог 5%", 150), "Творог 5%, порция 150 г");
  assert.equal(buildCaption("Гречка отварная", 180), "Гречка отварная, порция 180 г");
});

test("без веса подпись остаётся честной, а не выдумывает порцию", () => {
  assert.equal(buildCaption("Банан"), "Банан");
  assert.equal(buildCaption("Банан", null), "Банан");
  assert.equal(buildCaption("Банан", 0), "Банан");
});

test("дробный вес округляется: «порция 150.4 г» не бывает", () => {
  assert.equal(buildCaption("Творог 5%", 150.4), "Творог 5%, порция 150 г");
});

test("в подписи нет оценок и обещаний", () => {
  // Тон задан продуктом: «вкусный полезный завтрак» — не описание снимка, а
  // реклама, и она же нарушает правило про медицинские утверждения.
  const caption = buildCaption("Овсянка на воде", 250);
  for (const word of ["полезн", "вкусн", "идеальн", "правильн", "худе"]) {
    assert.doesNotMatch(caption.toLowerCase(), new RegExp(word), `в подписи оценка: ${caption}`);
  }
});

test("атрибуция не называет человека по имени", () => {
  // Согласие было на публикацию снимка еды, а не на то, чтобы имя стояло
  // рядом с собственным рационом.
  assert.equal(PHOTO_CREDIT, "Снимок читателя «Живого Тела»");
});

test("статусов ровно три и «одобрено» среди них одно", () => {
  assert.deepEqual([...PHOTO_STATUSES], ["pending", "approved", "rejected"]);
});

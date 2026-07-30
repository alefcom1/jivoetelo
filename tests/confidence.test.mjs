import test from "node:test";
import assert from "node:assert/strict";
import { CONFIDENCE_LABELS, confidenceRange, overallConfidence } from "../lib/confidence.ts";

test("подписи — ровно три уровня словами, без процентов", () => {
  assert.deepEqual(Object.keys(CONFIDENCE_LABELS).sort(), ["high", "low", "medium"]);
  for (const label of Object.values(CONFIDENCE_LABELS)) {
    assert.ok(!/%/.test(label), `«${label}» не должна содержать процент`);
  }
  assert.equal(CONFIDENCE_LABELS.high, "высокая");
  assert.equal(CONFIDENCE_LABELS.medium, "средняя");
  assert.equal(CONFIDENCE_LABELS.low, "низкая");
});

test("общая уверенность — по худшей позиции", () => {
  assert.equal(overallConfidence(["high", "high"]), "high");
  assert.equal(overallConfidence(["high", "medium"]), "medium");
  assert.equal(overallConfidence(["high", "medium", "low"]), "low");
  assert.equal(overallConfidence(["low"]), "low");
});

test("пустой список позиций не считается неуверенным", () => {
  assert.equal(overallConfidence([]), "high");
});

test("высокая уверенность — просто число, без диапазона", () => {
  assert.equal(confidenceRange(520, "high"), null);
});

test("диапазон у low ориентирован на пример спецификации: ±30%", () => {
  const range = confidenceRange(520, "low");
  assert.equal(range.min, Math.round(520 * 0.7));
  assert.equal(range.max, Math.round(520 * 1.3));
});

test("диапазон у medium уже, чем у low, и симметричен относительно значения", () => {
  const medium = confidenceRange(400, "medium");
  const low = confidenceRange(400, "low");
  assert.ok(medium.max - medium.min < low.max - low.min);
  assert.ok(medium.min < 400 && medium.max > 400);
});

test("диапазон нигде не уходит в отрицательные значения на разумных числах", () => {
  for (const value of [0, 1, 50, 520, 3000]) {
    for (const level of ["medium", "low"]) {
      const range = confidenceRange(value, level);
      assert.ok(range.min >= 0, `${level} ${value}: ${range.min}`);
    }
  }
});

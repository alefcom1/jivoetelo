import test from "node:test";
import assert from "node:assert/strict";
import { proteinRange } from "../lib/protein.ts";
import { computeTargets } from "../lib/targets.ts";

test("обычный расчёт для 65 кг", () => {
  const r = proteinRange(65);
  assert.equal(r.min, 78); // 1.2 * 65 = 78
  assert.equal(r.target, 104); // 1.6 * 65 = 104
  assert.equal(r.max, 130); // 2.0 * 65 = 130
});

test("обычный расчёт для 80 кг", () => {
  const r = proteinRange(80);
  assert.equal(r.min, 96); // 1.2 * 80 = 96
  assert.equal(r.target, 128); // 1.6 * 80 = 128
  assert.equal(r.max, 160); // 2.0 * 80 = 160
});

test("границы диапазона идут по возрастанию", () => {
  for (const weight of [30, 55.5, 65, 80, 120, 300]) {
    const r = proteinRange(weight);
    assert.ok(r.min < r.target, `min должен быть меньше target при весе ${weight}`);
    assert.ok(r.target < r.max, `target должен быть меньше max при весе ${weight}`);
  }
});

test("консистентность с computeTargets: target совпадает с proteinTarget", () => {
  const base = {
    goal: "maintain",
    sexForFormula: "female",
    birthYear: 1990,
    heightCm: 168,
    activity: "light",
  };

  for (const weightKg of [42, 65, 80, 96.5, 150]) {
    const targets = computeTargets({ ...base, weightKg }, 2026);
    const range = proteinRange(weightKg);
    assert.equal(range.target, targets.proteinTarget, `расхождение при весе ${weightKg}`);
  }
});

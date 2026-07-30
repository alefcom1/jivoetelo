import test from "node:test";
import assert from "node:assert/strict";
import { splitMacroTargets } from "../lib/macro-split.ts";

test("типичная цель: жир — 30% калорий, углеводы — остаток", () => {
  const { fatTarget, carbsTarget } = splitMacroTargets(2000, 100);
  // 2000 * 0.3 / 9 = 66.67 → 67
  assert.equal(fatTarget, 67);
  // 2000 - 400 (белок) - 600 (жир) = 1000 ккал → 250 г
  assert.equal(carbsTarget, 250);
});

test("сумма калорий по трём макросам не превышает kcalTarget", () => {
  for (const [kcal, protein] of [[2000, 100], [1500, 130], [3200, 180], [1200, 60]]) {
    const { fatTarget, carbsTarget } = splitMacroTargets(kcal, protein);
    const total = protein * 4 + fatTarget * 9 + carbsTarget * 4;
    assert.ok(total <= kcal + 10, `${kcal}/${protein}: сумма ${total}`);
  }
});

test("белок съедает почти всю низкую цель — жир и углеводы не уходят в минус", () => {
  const { fatTarget, carbsTarget } = splitMacroTargets(200, 100);
  assert.ok(fatTarget >= 0);
  assert.ok(carbsTarget >= 0);
});

test("нулевая или отрицательная цель не ломает расчёт", () => {
  assert.deepEqual(splitMacroTargets(0, 0), { fatTarget: 0, carbsTarget: 0 });
  assert.deepEqual(splitMacroTargets(-100, 50), { fatTarget: 0, carbsTarget: 0 });
});

test("больше калорий при том же белке — больше углеводов, жир расширяется тоже", () => {
  const small = splitMacroTargets(1800, 100);
  const big = splitMacroTargets(2800, 100);
  assert.ok(big.carbsTarget > small.carbsTarget);
  assert.ok(big.fatTarget > small.fatTarget);
});

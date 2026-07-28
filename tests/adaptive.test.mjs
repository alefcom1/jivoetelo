import test from "node:test";
import assert from "node:assert/strict";
import { proposeAdjustment } from "../lib/adaptive.ts";

const base = {
  goal: "lose",
  weeklyTrendChangeKg: -0.4,
  latestWeightKg: 80,
  daysLogged: 6,
  currentAdjustment: 0,
};

test("нормальный темп снижения — без предложений", () => {
  // -0.4 кг при 80 кг = -0.5% в неделю: в пределах ожидаемого
  assert.equal(proposeAdjustment(base), null);
});

test("слишком быстрое снижение — предложение добавить 150 ккал", () => {
  const p = proposeAdjustment({ ...base, weeklyTrendChangeKg: -1.0 });
  assert.equal(p.deltaKcal, 150);
  assert.match(p.reason, /добавить 150/);
});

test("вес не снижается при цели «снижение» — предложение убрать 150 ккал", () => {
  const p = proposeAdjustment({ ...base, weeklyTrendChangeKg: 0.05 });
  assert.equal(p.deltaKcal, -150);
});

test("мало записанных дней — предложений нет", () => {
  assert.equal(proposeAdjustment({ ...base, weeklyTrendChangeKg: -1.0, daysLogged: 3 }), null);
});

test("нет данных по тренду — предложений нет", () => {
  assert.equal(proposeAdjustment({ ...base, weeklyTrendChangeKg: null }), null);
});

test("накопленный предел ±450 не превышается", () => {
  const p = proposeAdjustment({ ...base, weeklyTrendChangeKg: 0.05, currentAdjustment: -450 });
  assert.equal(p, null);
});

test("поддержание: дрейф вверх — минус 150, дрейф вниз — плюс 150", () => {
  const up = proposeAdjustment({ ...base, goal: "maintain", weeklyTrendChangeKg: 0.5 });
  const down = proposeAdjustment({ ...base, goal: "maintain", weeklyTrendChangeKg: -0.5 });
  assert.equal(up.deltaKcal, -150);
  assert.equal(down.deltaKcal, 150);
});

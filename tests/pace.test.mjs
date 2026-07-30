import test from "node:test";
import assert from "node:assert/strict";
import {
  computePace,
  LIMIT_REASONS,
  MAX_DAILY_DEFICIT,
  MAX_KG_PER_WEEK,
  MAX_RELATIVE_DEFICIT,
  MUSCLE_SAFE_DEFICIT,
  PACE_OPTIONS,
} from "../lib/pace.ts";

/** Типичные люди, а не крайние значения: на них расчёт и живёт. */
const LIGHT = { weightKg: 60, tdeeKcal: 1900 };
const AVERAGE = { weightKg: 80, tdeeKcal: 2400 };
const HEAVY = { weightKg: 130, tdeeKcal: 3100 };

test("мягкий темп сохраняет мышцы, быстрый — уже нет", () => {
  assert.equal(computePace({ ...AVERAGE, pace: "gentle" }).musclePreserved, true);
  assert.equal(computePace({ ...AVERAGE, pace: "brisk" }).musclePreserved, false);
});

test("порог сохранения мышц — это дефицит, а не темп", () => {
  for (const person of [LIGHT, AVERAGE, HEAVY]) {
    for (const { key } of PACE_OPTIONS) {
      const r = computePace({ ...person, pace: key });
      assert.equal(r.musclePreserved, r.dailyDeficit <= MUSCLE_SAFE_DEFICIT, `${person.weightKg} кг, ${key}`);
    }
  }
});

test("ни один темп ни при каком весе не пробивает потолки", () => {
  for (let weightKg = 40; weightKg <= 200; weightKg += 5) {
    // Расход растёт с весом медленнее самого веса — примерно так это и выглядит.
    const tdeeKcal = 900 + 17 * weightKg;
    for (const { key } of PACE_OPTIONS) {
      const r = computePace({ weightKg, tdeeKcal, pace: key });
      const context = `${weightKg} кг, ${key}`;
      assert.ok(r.kgPerWeek <= MAX_KG_PER_WEEK + 1e-9, `${context}: ${r.kgPerWeek} кг/нед`);
      assert.ok(r.dailyDeficit <= MAX_DAILY_DEFICIT + 10, `${context}: ${r.dailyDeficit} ккал`);
      assert.ok(r.relativeDeficit <= MAX_RELATIVE_DEFICIT + 1e-9, `${context}: ${r.relativeDeficit}`);
    }
  }
});

test("у тяжёлого человека быстрый темп урезается, и причина названа", () => {
  const r = computePace({ ...HEAVY, pace: "brisk" });
  assert.notEqual(r.limitedBy, null, "1% от 130 кг — это 1,3 кг в неделю, так оставлять нельзя");
  assert.ok(LIMIT_REASONS[r.limitedBy].length > 20);
});

test("у человека обычного веса мягкий темп ничем не урезается", () => {
  const r = computePace({ ...AVERAGE, pace: "gentle" });
  assert.equal(r.limitedBy, null);
  assert.ok(Math.abs(r.kgPerWeek - 0.2) < 0.06, `${r.kgPerWeek} кг/нед`);
});

test("одинаковый процент веса — разная нагрузка: ради этого расчёт и сделан", () => {
  const light = computePace({ ...LIGHT, pace: "moderate" });
  const heavy = computePace({ ...HEAVY, pace: "moderate" });
  assert.ok(heavy.kgPerWeek > light.kgPerWeek, "тяжелее — быстрее в килограммах");
  assert.ok(
    heavy.relativeDeficit > light.relativeDeficit,
    `и тяжелее по ощущениям: ${light.relativeDeficit.toFixed(2)} против ${heavy.relativeDeficit.toFixed(2)}`,
  );
});

test("цель по весу превращается в срок, и срок сходится с темпом", () => {
  const r = computePace({ ...AVERAGE, pace: "moderate", targetLossKg: 8 });
  assert.ok(r.weeksToGoal >= 8 / r.kgPerWeek - 1 && r.weeksToGoal <= 8 / r.kgPerWeek + 1, `${r.weeksToGoal} недель`);
  assert.equal(computePace({ ...AVERAGE, pace: "moderate" }).weeksToGoal, null);
  assert.equal(computePace({ ...AVERAGE, pace: "moderate", targetLossKg: 0 }).weeksToGoal, null);
});

test("цель по калориям — это расход минус дефицит", () => {
  const r = computePace({ ...AVERAGE, pace: "moderate" });
  assert.ok(Math.abs(r.kcalTarget - (AVERAGE.tdeeKcal - r.dailyDeficit)) <= 10);
});

test("темпы упорядочены: быстрее не бывает медленнее", () => {
  let previous = 0;
  for (const { key } of PACE_OPTIONS) {
    const r = computePace({ ...AVERAGE, pace: key });
    assert.ok(r.kgPerWeek >= previous, `${key}: ${r.kgPerWeek} после ${previous}`);
    previous = r.kgPerWeek;
  }
});

test("мусор на входе не даёт бессмысленного ответа", () => {
  for (const bad of [
    { weightKg: 0, tdeeKcal: 2400 },
    { weightKg: 5000, tdeeKcal: 2400 },
    { weightKg: 80, tdeeKcal: 0 },
    { weightKg: 80, tdeeKcal: 99999 },
  ]) {
    const r = computePace({ ...bad, pace: "moderate" });
    assert.ok(r.kgPerWeek > 0 && r.kgPerWeek <= MAX_KG_PER_WEEK, JSON.stringify(bad));
    assert.ok(r.kcalTarget > 0, JSON.stringify(bad));
    assert.ok(Number.isFinite(r.relativeDeficit), JSON.stringify(bad));
  }
  // Неизвестный темп не должен ронять расчёт — берём мягкий.
  assert.deepEqual(
    computePace({ ...AVERAGE, pace: "невесть что" }),
    computePace({ ...AVERAGE, pace: "gentle" }),
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { computeTargets, computeTdee } from "../lib/targets.ts";
import { computePace } from "../lib/pace.ts";

const base = {
  goal: "maintain",
  sexForFormula: "female",
  birthYear: 1990,
  heightCm: 168,
  weightKg: 65,
  activity: "light",
};

test("поддержание: точка и диапазон вокруг TDEE по Миффлину-Сан Жеору", () => {
  // BMR = 10*65 + 6.25*168 - 5*36 - 161 = 650 + 1050 - 180 - 161 = 1359
  // TDEE = 1359 * 1.375 = 1868.6 → точка 1870; диапазон ±7%: 1740–2000 (окр. до 10)
  const t = computeTargets(base, 2026);
  assert.equal(t.kcalTarget, 1870);
  assert.equal(t.kcalMin, 1740);
  assert.equal(t.kcalMax, 2000);
  assert.equal(t.proteinTarget, 104); // 1.6 г/кг
  assert.equal(t.fiberTarget, 25);
  assert.equal(t.adjusted, false);
});

test("снижение веса даёт мягкий дефицит ~15%", () => {
  const maintain = computeTargets(base, 2026);
  const lose = computeTargets({ ...base, goal: "lose" }, 2026);
  assert.ok(lose.kcalMax < maintain.kcalMin, "дефицит должен опускать весь диапазон");
  const ratio = lose.kcalMin / maintain.kcalMin;
  assert.ok(ratio > 0.8 && ratio < 0.9, `ожидали ~0.85, получили ${ratio}`);
});

test("мужская формула даёт больше энергии при прочих равных", () => {
  const female = computeTargets(base, 2026);
  const male = computeTargets({ ...base, sexForFormula: "male" }, 2026);
  assert.ok(male.kcalMin > female.kcalMin);
});

test("безопасность: цель не опускается ниже жёсткого пола", () => {
  const t = computeTargets(
    { goal: "lose", sexForFormula: "female", birthYear: 1950, heightCm: 150, weightKg: 42, activity: "sedentary" },
    2026,
  );
  assert.ok(t.kcalMin >= 1200 * 0.93, `нижняя граница слишком низкая: ${t.kcalMin}`);
  assert.equal(t.adjusted, true);
});

test("безопасность: несовершеннолетним не выдаётся дефицит", () => {
  const minor = computeTargets({ ...base, birthYear: 2010, goal: "lose" }, 2026);
  const minorMaintain = computeTargets({ ...base, birthYear: 2010, goal: "maintain" }, 2026);
  assert.equal(minor.kcalMin, minorMaintain.kcalMin);
  assert.equal(minor.adjusted, true);
});

test("точечная оценка всегда лежит внутри диапазона", () => {
  // Точка и границы считаются из одной величины, но округляются по отдельности —
  // проверяем, что округление нигде не выталкивает точку за границы.
  for (const goal of ["lose", "maintain", "gain"]) {
    for (const weightKg of [42, 55, 65, 80, 96.5, 140]) {
      for (const activity of ["sedentary", "light", "moderate", "high"]) {
        const t = computeTargets({ ...base, goal, weightKg, activity }, 2026);
        assert.ok(
          t.kcalMin <= t.kcalTarget && t.kcalTarget <= t.kcalMax,
          `${goal}/${weightKg}кг/${activity}: ${t.kcalMin} ≤ ${t.kcalTarget} ≤ ${t.kcalMax}`,
        );
      }
    }
  }
});

// ===== Темп (lib/pace.ts) как источник дефицита — онбординг v2 =====

test("регрессия: без темпа результат в точности такой же, как до появления поля pace", () => {
  // Три способа «не задать темп» должны давать один и тот же результат — это
  // и есть защита для существующих профилей (profiles.pace у них null).
  const withoutField = computeTargets({ ...base, goal: "lose" }, 2026);
  const withUndefined = computeTargets({ ...base, goal: "lose", pace: undefined }, 2026);
  const withNull = computeTargets({ ...base, goal: "lose", pace: null }, 2026);
  assert.deepEqual(withUndefined, withoutField);
  assert.deepEqual(withNull, withoutField);
});

test("при заданном темпе дефицит берётся из lib/pace.ts, а не из плоских 15%", () => {
  const flat = computeTargets({ ...base, goal: "lose" }, 2026);
  const paced = computeTargets({ ...base, goal: "lose", pace: "brisk" }, 2026);
  // «Быстрый» темп даёт больший дефицит, чем дефолтные 15%, — цифра должна отличаться и быть меньше.
  assert.notEqual(paced.kcalTarget, flat.kcalTarget);
  assert.ok(paced.kcalTarget < flat.kcalTarget, `${paced.kcalTarget} должно быть меньше ${flat.kcalTarget}`);
});

test("темп в computeTargets даёт тот же дефицит, что computePace напрямую при том же расходе", () => {
  for (const pace of ["very_gentle", "gentle", "moderate", "brisk"]) {
    const tdeeKcal = computeTdee(base, 2026);
    const direct = computePace({ weightKg: base.weightKg, tdeeKcal, pace });
    const t = computeTargets({ ...base, goal: "lose", pace }, 2026);
    assert.equal(t.kcalTarget, direct.kcalTarget, `${pace}: ${t.kcalTarget} vs ${direct.kcalTarget}`);
  }
});

test("темп игнорируется, если цель не «снижение веса»", () => {
  const withPace = computeTargets({ ...base, goal: "maintain", pace: "brisk" }, 2026);
  const withoutPace = computeTargets({ ...base, goal: "maintain" }, 2026);
  assert.deepEqual(withPace, withoutPace);
});

test("темп игнорируется для несовершеннолетних — цель уже смягчена до поддержания", () => {
  const minorWithPace = computeTargets({ ...base, birthYear: 2010, goal: "lose", pace: "brisk" }, 2026);
  const minorMaintain = computeTargets({ ...base, birthYear: 2010, goal: "maintain" }, 2026);
  // adjusted у minorWithPace будет true (сработала именно возрастная поправка,
  // см. «безопасность: несовершеннолетним не выдаётся дефицит» выше) — это
  // ожидаемо и проверено отдельно; здесь важно, что сами цифры плана совпадают.
  assert.equal(minorWithPace.kcalTarget, minorMaintain.kcalTarget);
  assert.equal(minorWithPace.kcalMin, minorMaintain.kcalMin);
  assert.equal(minorWithPace.kcalMax, minorMaintain.kcalMax);
});

test("нижняя граница калорий действует и при заданном темпе", () => {
  const t = computeTargets(
    { goal: "lose", sexForFormula: "female", birthYear: 1950, heightCm: 150, weightKg: 42, activity: "sedentary", pace: "brisk" },
    2026,
  );
  assert.ok(t.kcalMin >= 1200 * 0.93, `нижняя граница слишком низкая: ${t.kcalMin}`);
  assert.equal(t.adjusted, true);
});

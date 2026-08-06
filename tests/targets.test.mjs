import test from "node:test";
import assert from "node:assert/strict";
import { computeTargets, computeTdee, explainTargets } from "../lib/targets.ts";
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

// ===== Своя норма и разбор расчёта =====

test("своя норма отменяет формулу целиком", () => {
  // Не «уточняет», а именно отменяет: врач, назначивший 1800, не имел в виду
  // 1800 с поправкой на нашу активность и наш темп снижения.
  const base = {
    goal: "lose", sexForFormula: "female", birthYear: 1990,
    heightCm: 165, weightKg: 70, activity: "moderate",
    adjustmentKcal: -300, pace: "fast",
  };
  const byFormula = computeTargets(base, 2026);
  const byHand = computeTargets({ ...base, kcalOverride: 1800 }, 2026);

  assert.notEqual(byFormula.kcalTarget, 1800);
  assert.equal(byHand.kcalTarget, 1800);
  assert.equal(byHand.source, "manual");
  assert.equal(byFormula.source, "formula");
});

test("у своей нормы диапазон схлопнут в точку", () => {
  // Диапазон — честная оценка неточности формулы. К числу, названному
  // человеком, эта неточность отношения не имеет: растянув 1800 в 1670–1930,
  // мы приписали бы врачу то, чего он не говорил.
  const t = computeTargets({
    goal: "maintain", sexForFormula: "male", birthYear: 1985,
    heightCm: 180, weightKg: 80, activity: "light", kcalOverride: 2200,
  }, 2026);
  assert.equal(t.kcalMin, 2200);
  assert.equal(t.kcalMax, 2200);
});

test("нижняя граница безопасности действует и на свою норму", () => {
  // Единственное, что переживает переопределение. Мы не знаем, кто ввёл это
  // число и зачем, и 600 ккал в день — уже не настройка.
  const female = computeTargets({
    goal: "lose", sexForFormula: "female", birthYear: 1990,
    heightCm: 165, weightKg: 60, activity: "light", kcalOverride: 600,
  }, 2026);
  assert.equal(female.kcalTarget, 1200);
  assert.equal(female.adjusted, true, "поднятие до границы должно быть помечено");

  const male = computeTargets({
    goal: "lose", sexForFormula: "male", birthYear: 1990,
    heightCm: 180, weightKg: 80, activity: "light", kcalOverride: 900,
  }, 2026);
  assert.equal(male.kcalTarget, 1500);
});

test("пустая своя норма — это расчёт по формуле, а не ноль", () => {
  const base = {
    goal: "maintain", sexForFormula: "female", birthYear: 1990,
    heightCm: 165, weightKg: 65, activity: "light",
  };
  const expected = computeTargets(base, 2026).kcalTarget;
  for (const empty of [null, undefined]) {
    assert.equal(computeTargets({ ...base, kcalOverride: empty }, 2026).kcalTarget, expected);
  }
});

test("разбор объясняет каждый шаг и сходится с итогом", () => {
  // Смысл разбора в том, что последнее число в нём — то самое, что человек
  // видит на экране. Разойдутся — объяснение станет хуже его отсутствия.
  const { targets, steps } = explainTargets({
    goal: "lose", sexForFormula: "female", birthYear: 1990,
    heightCm: 165, weightKg: 70, activity: "moderate",
    adjustmentKcal: -150, pace: "moderate",
  }, 2026);

  assert.ok(steps.length >= 3, `шагов всего ${steps.length}`);
  assert.match(steps[0].label, /Миффлин/, "первым шагом должна быть формула");
  assert.equal(steps.at(-1).kcal, targets.kcalTarget, "последний шаг разбора не сходится с нормой");
  for (const step of steps) {
    assert.ok(Number.isFinite(step.kcal), `шаг «${step.label}» без числа`);
    assert.ok(step.label.length > 0);
  }
});

test("адаптивная поправка попадает в разбор, только если она есть", () => {
  const base = {
    goal: "maintain", sexForFormula: "male", birthYear: 1985,
    heightCm: 180, weightKg: 80, activity: "light",
  };
  const without = explainTargets(base, 2026).steps.map((s) => s.label);
  const with150 = explainTargets({ ...base, adjustmentKcal: 150 }, 2026).steps.map((s) => s.label);

  assert.ok(!without.some((l) => /Адаптивная/.test(l)), "поправки нет, а строка про неё есть");
  assert.ok(with150.some((l) => /Адаптивная/.test(l)), "поправка есть, а строки про неё нет");
});

test("у своей нормы разбор короткий и без формулы", () => {
  // Показывать шаги расчёта, который не применялся, — врать о происхождении
  // числа ровно там, где мы это происхождение и объясняем.
  const { steps } = explainTargets({
    goal: "lose", sexForFormula: "female", birthYear: 1990,
    heightCm: 165, weightKg: 70, activity: "moderate", kcalOverride: 1900,
  }, 2026);

  assert.equal(steps.length, 1);
  assert.ok(!steps.some((s) => /Миффлин/.test(s.label)));
  assert.equal(steps[0].kcal, 1900);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  analyseDishImpact,
  benjaminiHochberg,
  buildObservations,
  effectiveN,
  FLAG_ALCOHOL,
  FLAG_LATE_MEAL,
  lag1Autocorrelation,
  MIN_EFFECT_KG,
  removeCalorieEffect,
  studentTCdf,
  studentTQuantile,
} from "../lib/weight-response.ts";
import { shiftDay } from "../lib/dates.ts";

// ─── Детерминированный «случайный» ряд ─────────────────────────────────────
// Свой генератор, а не Math.random(): проверка на нулевом эффекте обязана
// давать один и тот же ответ на каждом прогоне, иначе тест то падает, то нет.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Нормальный шум методом Бокса — Мюллера. */
function gauss(random) {
  const u = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

const START = "2026-01-01";

/**
 * Синтетический пользователь: ежедневные замеры вокруг ровного веса и дневник,
 * где блюда расставлены случайно. `effectKg` — истинный сдвиг замера наутро
 * после дней с блюдом `dish:target`.
 */
function makeUser({ days, seed, effectKg = 0, noiseKg = 0.6, dishes = 8 }) {
  const random = makeRandom(seed);
  const weights = [];
  const intake = [];
  const keysByDay = [];

  for (let i = 0; i < days; i += 1) {
    const day = shiftDay(START, i);
    const keys = [];
    for (let d = 0; d < dishes; d += 1) {
      if (random() < 0.4) keys.push(`dish:filler-${d}`);
    }
    if (random() < 0.4) keys.push("dish:target");
    keysByDay.push(keys);
    intake.push({
      day,
      kcal: 2000 + Math.round(gauss(random) * 300),
      mealCount: 3,
      keys,
      lastMealTime: "19:30",
      hasAlcohol: false,
    });
  }

  for (let i = 0; i < days; i += 1) {
    const day = shiftDay(START, i);
    // Замер дня i отражает еду дня i-1 — так же, как их сопоставляет модуль.
    const carried = i > 0 && keysByDay[i - 1].includes("dish:target") ? effectKg : 0;
    weights.push({ onDate: day, weightKg: Math.round((80 + carried + gauss(random) * noiseKg) * 100) / 100 });
  }

  return { weights, intake, candidateKeys: ["dish:target", ...Array.from({ length: dishes }, (_, d) => `dish:filler-${d}`)] };
}

// ─── Математика ────────────────────────────────────────────────────────────

test("распределение Стьюдента совпадает с табличными значениями", () => {
  // Двусторонние критические значения при p = 0.05.
  const table = [[1, 12.706], [2, 4.303], [5, 2.571], [10, 2.228], [30, 2.042], [100, 1.984]];
  for (const [df, expected] of table) {
    assert.ok(
      Math.abs(studentTQuantile(0.975, df) - expected) < 0.005,
      `df=${df}: ${studentTQuantile(0.975, df)} вместо ${expected}`,
    );
  }
  assert.ok(Math.abs(studentTCdf(0, 10) - 0.5) < 1e-9, "медиана в нуле");
  assert.ok(Math.abs(studentTCdf(2.228, 10) - 0.975) < 1e-3);
  // Симметрия.
  assert.ok(Math.abs(studentTCdf(-1.5, 7) + studentTCdf(1.5, 7) - 1) < 1e-9);
});

test("Бенджамини-Хохберг монотонен и не превышает единицы", () => {
  const q = benjaminiHochberg([0.001, 0.01, 0.03, 0.5, 0.9]);
  assert.equal(q.length, 5);
  for (const value of q) assert.ok(value >= 0 && value <= 1, `q вне [0,1]: ${value}`);
  // Порядок сохраняется: меньшему p — не больший q.
  for (let i = 1; i < q.length; i += 1) assert.ok(q[i] >= q[i - 1] - 1e-12);
  // Единственная гипотеза не корректируется.
  assert.ok(Math.abs(benjaminiHochberg([0.04])[0] - 0.04) < 1e-12);
  assert.deepEqual(benjaminiHochberg([]), []);
});

test("поправка на калорийность убирает связь, которую даёт только калорийность", () => {
  // Отклонение целиком объясняется калориями: остатки должны схлопнуться.
  const observations = Array.from({ length: 20 }, (_, i) => ({
    day: shiftDay(START, i),
    kcal: 1500 + i * 50,
    deviationKg: (1500 + i * 50) * 0.0004,
    keys: new Set(),
  }));
  const { residuals, slope } = removeCalorieEffect(observations);
  assert.ok(Math.abs(slope - 0.0004) < 1e-6, `наклон ${slope}`);
  for (const residual of residuals) assert.ok(Math.abs(residual) < 1e-9, `остаток ${residual}`);
});

test("эффективное N уменьшается с автокорреляцией", () => {
  assert.equal(effectiveN(30, 0), 30);
  assert.ok(effectiveN(30, 0.5) < 15.1 && effectiveN(30, 0.5) > 9.9);
  assert.ok(effectiveN(30, 0.9) < effectiveN(30, 0.5));
  assert.equal(effectiveN(2, 0.99), 2, "меньше двух не бывает");

  const alternating = [1, -1, 1, -1, 1, -1, 1, -1];
  assert.ok(lag1Autocorrelation(alternating) < 0, "чередование даёт отрицательную автокорреляцию");
  const drifting = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.ok(lag1Autocorrelation(drifting) > 0.5, "монотонный ряд — сильная автокорреляция");
});

// ─── Наблюдения ────────────────────────────────────────────────────────────

test("наблюдения строятся только по соседним дням с обоими замерами", () => {
  const weights = [
    { onDate: "2026-01-01", weightKg: 80 },
    { onDate: "2026-01-02", weightKg: 80.5 },
    // 3 января замера нет — пара «2 → 3» невозможна.
    { onDate: "2026-01-05", weightKg: 80.2 },
  ];
  const intake = ["2026-01-01", "2026-01-02", "2026-01-04"].map((day) => ({
    day, kcal: 2000, mealCount: 3, keys: ["dish:a"], lastMealTime: "19:00", hasAlcohol: false,
  }));
  const observations = buildObservations(weights, intake);
  assert.deepEqual(observations.map((o) => o.day), ["2026-01-01"]);
});

test("день с неполным дневником выбрасывается, а не идёт в контрольную группу", () => {
  const weights = [
    { onDate: "2026-01-01", weightKg: 80 },
    { onDate: "2026-01-02", weightKg: 80.4 },
  ];
  const skimpy = [{ day: "2026-01-01", kcal: 400, mealCount: 1, keys: [], lastMealTime: "19:00", hasAlcohol: false }];
  assert.deepEqual(buildObservations(weights, skimpy), [], "один приём на 400 ккал — это не день без блюда, это неизвестность");
});

test("неправдоподобный скачок веса между соседними днями отбрасывается", () => {
  const weights = [
    { onDate: "2026-01-01", weightKg: 80 },
    { onDate: "2026-01-02", weightKg: 88 },
  ];
  const intake = [{ day: "2026-01-01", kcal: 2000, mealCount: 3, keys: ["dish:a"], lastMealTime: "19:00", hasAlcohol: false }];
  assert.deepEqual(buildObservations(weights, intake), []);
});

test("признаки дня выводятся из времени и алкоголя", () => {
  const weights = [
    { onDate: "2026-01-01", weightKg: 80 },
    { onDate: "2026-01-02", weightKg: 80.4 },
    { onDate: "2026-01-03", weightKg: 80.1 },
  ];
  const intake = [
    { day: "2026-01-01", kcal: 2000, mealCount: 3, keys: [], lastMealTime: "22:10", hasAlcohol: true },
    { day: "2026-01-02", kcal: 2000, mealCount: 3, keys: [], lastMealTime: "18:00", hasAlcohol: false },
  ];
  const [late, early] = buildObservations(weights, intake);
  assert.ok(late.keys.has(FLAG_LATE_MEAL) && late.keys.has(FLAG_ALCOHOL));
  assert.ok(!early.keys.has(FLAG_LATE_MEAL) && !early.keys.has(FLAG_ALCOHOL));
});

// ─── Пороги ────────────────────────────────────────────────────────────────

test("мало данных — уровень none и честное «сколько не хватает»", () => {
  const { weights, intake, candidateKeys } = makeUser({ days: 8, seed: 1 });
  const report = analyseDishImpact(weights, intake, candidateKeys);
  assert.equal(report.level, "none");
  assert.deepEqual(report.effects, []);
  assert.ok(report.missingPairs > 0);
});

test("данных на наблюдения, но не на статистику — ничего не «подтверждено»", () => {
  const { weights, intake, candidateKeys } = makeUser({ days: 20, seed: 2, effectKg: 1.5 });
  const report = analyseDishImpact(weights, intake, candidateKeys);
  assert.equal(report.level, "descriptive");
  assert.ok(report.usablePairs >= 12 && report.usablePairs < 40);
  assert.deepEqual(
    report.effects.filter((e) => e.reportable),
    [],
    "на описательном уровне reportable не выставляется даже при огромном эффекте",
  );
});

// ─── Главная проверка: нулевой эффект ──────────────────────────────────────

test("на НУЛЕВОМ истинном эффекте находок почти нет — это и есть смысл порогов", () => {
  // Двести синтетических пользователей, у которых блюда ни на что не влияют.
  // Без поправок такой прогон даёт «значимую» находку примерно у половины.
  let usersWithFinding = 0;
  const users = 200;
  for (let seed = 1; seed <= users; seed += 1) {
    const { weights, intake, candidateKeys } = makeUser({ days: 90, seed: seed * 7919, effectKg: 0 });
    const report = analyseDishImpact(weights, intake, candidateKeys);
    if (report.effects.some((effect) => effect.reportable)) usersWithFinding += 1;
  }
  const share = usersWithFinding / users;
  assert.ok(share <= 0.05, `ложные находки у ${Math.round(share * 100)}% пользователей — пороги не держат`);
});

test("настоящий крупный эффект находится", () => {
  // 0,9 кг — заведомо выше минимального размера эффекта и правдоподобно для
  // задержки воды после солёного.
  const { weights, intake, candidateKeys } = makeUser({ days: 120, seed: 4242, effectKg: 0.9, noiseKg: 0.5 });
  const report = analyseDishImpact(weights, intake, candidateKeys);
  assert.equal(report.level, "statistical");
  const target = report.effects.find((effect) => effect.key === "dish:target");
  assert.ok(target, "блюдо должно попасть в разбор");
  assert.equal(target.reportable, true, `q=${target.qValue}, delta=${target.deltaKg}`);
  assert.ok(target.deltaKg > 0.5, `оценка эффекта ${target.deltaKg}`);
  assert.ok(target.ciLowKg < target.deltaKg && target.deltaKg < target.ciHighKg);
});

test("маленький эффект не показывается, даже если он статистически значим", () => {
  const { weights, intake, candidateKeys } = makeUser({ days: 400, seed: 77, effectKg: 0.25, noiseKg: 0.4 });
  const report = analyseDishImpact(weights, intake, candidateKeys);
  const target = report.effects.find((effect) => effect.key === "dish:target");
  assert.ok(target, "эффект посчитан");
  assert.ok(Math.abs(target.deltaKg) < MIN_EFFECT_KG, `оценка ${target.deltaKg}`);
  assert.equal(target.reportable, false, "ниже минимального размера эффекта — не показываем");
});

test("блюдо с малым числом наблюдений не проверяется вовсе", () => {
  const { weights, intake, candidateKeys } = makeUser({ days: 120, seed: 9, effectKg: 0 });
  // Ключ, которого нет ни в одном дне.
  const report = analyseDishImpact(weights, intake, [...candidateKeys, "dish:never-eaten"]);
  assert.equal(report.effects.some((effect) => effect.key === "dish:never-eaten"), false);
});

test("порядок эффектов — по величине, а не по знаку: рейтинга блюд нет", () => {
  const { weights, intake, candidateKeys } = makeUser({ days: 150, seed: 31, effectKg: 0.8 });
  const report = analyseDishImpact(weights, intake, candidateKeys);
  const magnitudes = report.effects.map((effect) => Math.abs(effect.deltaKg));
  for (let i = 1; i < magnitudes.length; i += 1) {
    assert.ok(magnitudes[i] <= magnitudes[i - 1] + 1e-9, "список отсортирован по модулю эффекта");
  }
});

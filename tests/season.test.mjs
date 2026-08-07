import test from "node:test";
import assert from "node:assert/strict";
import { lastMonths, MIN_MONTH_DAYS, MIN_MONTHS, seasonReport } from "../lib/season.ts";

/**
 * Срез месяц-к-месяцу.
 *
 * Главное, что здесь проверяется, — месяц с тремя записями не сравнивается с
 * месяцем с двадцатью восемью. Такое сравнение выглядит как вывод о человеке,
 * а на деле это вывод о том, какие именно дни он успел записать.
 */

/** Ряд дней месяца с одинаковыми числами — удобно задавать «обычный месяц». */
function month(key, count, patch = {}) {
  return Array.from({ length: count }, (_, i) => ({
    day: `${key}-${String(i + 1).padStart(2, "0")}`,
    meals: 3, kcal: 2000, protein: 90, fiber: 20,
    ...patch,
  }));
}

/* ===== Календарь ===== */

test("последние месяцы идут от старого к новому и не спотыкаются о декабрь", () => {
  assert.deepEqual(lastMonths("2026-08-05", 3), ["2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(lastMonths("2026-02-14", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(lastMonths("2026-01-01", 1), ["2026-01"]);
});

test("год — двенадцать месяцев, и первый ровно на год раньше", () => {
  const months = lastMonths("2026-08-05", 12);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2025-09");
  assert.equal(months.at(-1), "2026-08");
});

/* ===== Сборка ===== */

test("месяцы считаются по дням с записями, а не по календарным", () => {
  const report = seasonReport([...month("2026-07", 20)], [], "2026-08-05", 3);
  const july = report.months.find((m) => m.month === "2026-07");
  assert.equal(july.loggedDays, 20);
  assert.equal(july.kcalPerDay, 2000, "среднее делится на дни с записями");
  assert.equal(july.mealsPerDay, 3);
});

test("пустой месяц показывается, но без чисел", () => {
  const report = seasonReport([...month("2026-08", 10)], [], "2026-08-05", 3);
  const june = report.months.find((m) => m.month === "2026-06");
  assert.equal(june.loggedDays, 0);
  assert.equal(june.kcalPerDay, null, "ноль вместо «нет данных» — это выдуманное число");
  assert.equal(june.comparable, false);
});

test("месяцы вне окна отбрасываются", () => {
  const report = seasonReport([...month("2025-01", 28)], [], "2026-08-05", 3);
  assert.equal(report.months.length, 3);
  assert.ok(report.months.every((m) => m.loggedDays === 0));
});

test("вес за месяц — среднее, а не последний замер", () => {
  const weights = [
    { day: "2026-07-01", weightKg: 80 },
    { day: "2026-07-15", weightKg: 82 },
    { day: "2026-07-28", weightKg: 84 },
  ];
  const report = seasonReport([...month("2026-07", 20)], weights, "2026-08-05", 3);
  assert.equal(report.months.find((m) => m.month === "2026-07").weightKg, 82);
});

/* ===== Сравнимость ===== */

test("месяц с горсткой записей не идёт в сравнение", () => {
  const report = seasonReport(
    [...month("2026-06", MIN_MONTH_DAYS - 1), ...month("2026-08", 20)],
    [], "2026-08-05", 3,
  );
  assert.equal(report.months.find((m) => m.month === "2026-06").comparable, false);
  assert.equal(report.enough, false, `сравнимых месяцев меньше ${MIN_MONTHS} — сравнивать нечего`);
  assert.deepEqual(report.notes, [], "наблюдения построены на одном месяце");
});

test("одного месяца мало, двух достаточно", () => {
  const one = seasonReport([...month("2026-08", 20)], [], "2026-08-05", 3);
  assert.equal(one.enough, false);
  const two = seasonReport([...month("2026-07", 20), ...month("2026-08", 20)], [], "2026-08-05", 3);
  assert.equal(two.enough, true);
});

/* ===== Наблюдения ===== */

test("одинаковые месяцы не порождают наблюдений", () => {
  // Молчание — правильный ответ, когда ничего не изменилось. Выдавать
  // «всё стабильно» на каждый заход значит приучить пропускать этот блок.
  const report = seasonReport(
    [...month("2026-06", 20), ...month("2026-07", 20), ...month("2026-08", 20)],
    [], "2026-08-05", 3,
  );
  assert.deepEqual(report.notes, []);
});

test("выросший белок замечается, шум — нет", () => {
  const grown = seasonReport(
    [...month("2026-06", 20, { protein: 70 }), ...month("2026-08", 20, { protein: 110 })],
    [], "2026-08-05", 3,
  );
  assert.ok(grown.notes.some((n) => n.includes("Белка")), grown.notes.join(" | "));
  assert.ok(grown.notes.some((n) => n.includes("июне") && n.includes("августе")), "месяцы не названы");

  const noise = seasonReport(
    [...month("2026-06", 20, { protein: 90 }), ...month("2026-08", 20, { protein: 96 })],
    [], "2026-08-05", 3,
  );
  assert.ok(!noise.notes.some((n) => n.includes("Белка")), "шесть граммов белка — это погрешность оценки по фото");
});

test("вес сравнивается средними и только за пределами колебаний воды", () => {
  const base = [...month("2026-06", 20), ...month("2026-08", 20)];
  const moved = seasonReport(base, [
    { day: "2026-06-10", weightKg: 84 },
    { day: "2026-08-10", weightKg: 81 },
  ], "2026-08-05", 3);
  assert.ok(moved.notes.some((n) => n.includes("ниже")), moved.notes.join(" | "));

  const same = seasonReport(base, [
    { day: "2026-06-10", weightKg: 82 },
    { day: "2026-08-10", weightKg: 82.4 },
  ], "2026-08-05", 3);
  assert.ok(!same.notes.some((n) => n.includes("вес")), "четыреста граммов — это вода");
});

test("падение ритма называется так же прямо, как рост", () => {
  const report = seasonReport(
    [...month("2026-06", 25), ...month("2026-08", 10)],
    [], "2026-08-05", 3,
  );
  assert.ok(report.notes.some((n) => n.includes("меньше")), report.notes.join(" | "));
});

/* ===== Тон ===== */

test("наблюдения описывают, а не оценивают", () => {
  const FORBIDDEN = [/молодец/i, /отличн/i, /плохо/i, /хуже/i, /лучше/i, /сорвал/i, /вы стали/i, /надо/i];
  const report = seasonReport(
    [
      ...month("2026-06", 25, { protein: 60, fiber: 12 }),
      ...month("2026-07", 18, { protein: 85, fiber: 18 }),
      ...month("2026-08", 10, { protein: 110, fiber: 25 }),
    ],
    [{ day: "2026-06-10", weightKg: 86 }, { day: "2026-08-10", weightKg: 81 }],
    "2026-08-05", 3,
  );
  assert.ok(report.notes.length >= 2, "нечего проверять");
  for (const note of report.notes) {
    for (const bad of FORBIDDEN) assert.ok(!bad.test(note), `«${note}» нарушает ${bad}`);
    assert.ok(!note.includes("!"), `«${note}» — восклицание не в голосе сервиса`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildWeekReview } from "../lib/review.ts";

const targets = { kcalMin: 1740, kcalMax: 2000, proteinTarget: 104, fiberTarget: 25, adjusted: false };

const goodWeek = {
  dayStats: [
    { day: "2026-07-20", kcal: 1850, protein: 100, fiber: 24 },
    { day: "2026-07-21", kcal: 1900, protein: 110, fiber: 26 },
    { day: "2026-07-22", kcal: 1800, protein: 98, fiber: 22 },
    { day: "2026-07-23", kcal: 1950, protein: 105, fiber: 25 },
    { day: "2026-07-24", kcal: 1880, protein: 102, fiber: 23 },
  ],
  weeklyTrendChangeKg: -0.05,
  targets,
  showCalories: true,
};

test("хорошая неделя: ритм, питание в диапазоне, стабильный тренд", () => {
  const review = buildWeekReview(goodWeek);
  assert.equal(review.daysLogged, 5);
  assert.equal(review.avgKcal, 1876);
  const text = review.sections.map((s) => s.text).join(" ");
  assert.match(text, /устойчивый ритм/);
  assert.match(text, /в пределах вашего диапазона/);
  assert.match(text, /около цели/);
  assert.match(text, /стабильный/);
});

test("пустая неделя: поддерживающий текст без стыда", () => {
  const review = buildWeekReview({ dayStats: [], weeklyTrendChangeKg: null, targets, showCalories: true });
  assert.equal(review.daysLogged, 0);
  assert.equal(review.sections.length, 1);
  assert.match(review.sections[0].text, /ничего компенсировать не нужно/i);
});

test("мало белка → совет и фокус недели про белок", () => {
  const review = buildWeekReview({
    ...goodWeek,
    dayStats: goodWeek.dayStats.map((d) => ({ ...d, protein: 50 })),
  });
  const text = review.sections.map((s) => s.text).join(" ");
  assert.match(text, /ниже цели/);
  assert.match(text, /источник белка в каждый основной приём/i);
});

test("запрещённые формулировки не встречаются", () => {
  const variants = [
    goodWeek,
    { ...goodWeek, dayStats: goodWeek.dayStats.map((d) => ({ ...d, kcal: 3200 })) },
    { ...goodWeek, dayStats: [], weeklyTrendChangeKg: null },
    { ...goodWeek, weeklyTrendChangeKg: 1.2 },
  ];
  for (const input of variants) {
    const text = buildWeekReview(input).sections.map((s) => s.text).join(" ");
    for (const forbidden of ["сорвал", "провалил", "плохая еда", "запрещённый", "сожгите", "отработайте", "силы воли"]) {
      assert.ok(!text.toLowerCase().includes(forbidden), `нашли запрещённое «${forbidden}» в: ${text}`);
    }
  }
});

test("при скрытых калориях цифры ккал не попадают в текст", () => {
  const review = buildWeekReview({ ...goodWeek, showCalories: false });
  const text = review.sections.map((s) => s.text).join(" ");
  assert.ok(!text.includes("ккал"), `калории в тексте при showCalories=false: ${text}`);
});

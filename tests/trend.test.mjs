import test from "node:test";
import assert from "node:assert/strict";
import { weeklyTrendChange, weightTrend } from "../lib/trend.ts";

test("тренд сглаживает дневной шум", () => {
  const trend = weightTrend([
    { onDate: "2026-07-01", weightKg: 80 },
    { onDate: "2026-07-02", weightKg: 81.2 }, // скачок от воды
    { onDate: "2026-07-03", weightKg: 79.8 },
  ]);
  assert.equal(trend[0].trendKg, 80);
  assert.ok(trend[1].trendKg < 80.5, "тренд не должен прыгать вслед за замером");
  assert.ok(trend[2].trendKg > 79.9 && trend[2].trendKg < 80.4);
});

test("тренд сортирует записи по дате", () => {
  const trend = weightTrend([
    { onDate: "2026-07-03", weightKg: 79 },
    { onDate: "2026-07-01", weightKg: 81 },
    { onDate: "2026-07-02", weightKg: 80 },
  ]);
  assert.deepEqual(trend.map((p) => p.onDate), ["2026-07-01", "2026-07-02", "2026-07-03"]);
});

test("недельное изменение считается от точки ~7 дней назад", () => {
  const entries = [];
  for (let i = 0; i < 15; i++) {
    entries.push({ onDate: `2026-07-${String(i + 1).padStart(2, "0")}`, weightKg: 82 - i * 0.1 });
  }
  const change = weeklyTrendChange(weightTrend(entries));
  assert.ok(change !== null && change < 0, "на снижающемся весе изменение отрицательное");
  assert.ok(Math.abs(change) < 1.5, "изменение за неделю должно быть небольшим");
});

test("недельное изменение null, если данных меньше недели", () => {
  const change = weeklyTrendChange(weightTrend([
    { onDate: "2026-07-01", weightKg: 80 },
    { onDate: "2026-07-03", weightKg: 79.8 },
  ]));
  assert.equal(change, null);
});

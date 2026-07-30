import test from "node:test";
import assert from "node:assert/strict";
import { buildWeightChart } from "../lib/weight-chart.ts";

function point(onDate, weightKg, trendKg) {
  return { onDate, weightKg, trendKg };
}

test("пустой тренд не рисует ничего", () => {
  assert.equal(buildWeightChart([], { width: 300, height: 100 }), null);
});

test("одна точка встаёт по центру ширины", () => {
  const result = buildWeightChart([point("2026-07-01", 80, 80)], { width: 300, height: 100, padding: 10 });
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].x, 150); // (300 - 2*10) / 2 + 10
});

test("первая и последняя точки садятся на края внутренней области", () => {
  const trend = [point("2026-07-01", 80, 80), point("2026-07-08", 79, 79.5), point("2026-07-15", 78, 78.7)];
  const result = buildWeightChart(trend, { width: 320, height: 120, padding: 10 });
  assert.equal(result.points[0].x, 10);
  assert.equal(result.points[2].x, 310);
  assert.equal(result.lastPoint.x, 310);
});

test("снижающийся тренд рисуется сверху вниз (меньше вес — ниже на экране? нет — выше)", () => {
  // В SVG y растёт вниз. Больший вес должен получать меньший y (выше на графике)
  // только если мы рисуем «выше = больше» — так и сделано: убеждаемся, что
  // точка с большим кг имеет меньший y, чем точка с меньшим кг.
  const trend = [point("2026-07-01", 82, 82), point("2026-07-08", 78, 78)];
  const result = buildWeightChart(trend, { width: 300, height: 100, padding: 0 });
  assert.ok(result.points[0].y < result.points[1].y, "82 кг должно быть выше (меньший y), чем 78 кг");
});

test("стабильный вес не растягивает ось в шум — минимальный разброс 0.5 кг", () => {
  const trend = [point("2026-07-01", 80, 80), point("2026-07-08", 80.02, 80.02)];
  const result = buildWeightChart(trend, { width: 300, height: 100 });
  assert.ok(result.maxKg - result.minKg >= 0.5, `${result.minKg}..${result.maxKg}`);
});

test("целевой вес расширяет шкалу, если он вне диапазона тренда", () => {
  const trend = [point("2026-07-01", 80, 80), point("2026-07-08", 79, 79)];
  const withoutTarget = buildWeightChart(trend, { width: 300, height: 100 });
  const withTarget = buildWeightChart(trend, { width: 300, height: 100, targetWeightKg: 70 });
  assert.ok(withTarget.minKg < withoutTarget.minKg);
  assert.notEqual(withTarget.targetY, null);
});

test("без целевого веса targetY — null", () => {
  const trend = [point("2026-07-01", 80, 80)];
  const result = buildWeightChart(trend, { width: 300, height: 100 });
  assert.equal(result.targetY, null);
});

test("linePoints — валидная строка атрибута points", () => {
  const trend = [point("2026-07-01", 80, 80), point("2026-07-08", 79, 79)];
  const result = buildWeightChart(trend, { width: 300, height: 100 });
  assert.equal(result.linePoints, result.points.map((p) => `${p.x},${p.y}`).join(" "));
  assert.match(result.linePoints, /^[\d.]+,[\d.]+ [\d.]+,[\d.]+$/);
});

test("все точки лежат внутри отведённой области с учётом отступа", () => {
  const trend = Array.from({ length: 10 }, (_, i) => point(`2026-07-${String(i + 1).padStart(2, "0")}`, 80 - i * 0.3, 80 - i * 0.3));
  const width = 320;
  const height = 140;
  const padding = 12;
  const result = buildWeightChart(trend, { width, height, padding, targetWeightKg: 75 });
  for (const p of result.points) {
    assert.ok(p.x >= padding - 0.5 && p.x <= width - padding + 0.5, `x=${p.x}`);
    assert.ok(p.y >= padding - 0.5 && p.y <= height - padding + 0.5, `y=${p.y}`);
  }
});

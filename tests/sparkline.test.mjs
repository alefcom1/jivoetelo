import test from "node:test";
import assert from "node:assert/strict";
import { pointsToArea, pointsToPolyline, sparklinePoints } from "../lib/sparkline.ts";

test("пустой ряд — пустой список точек, без ошибок", () => {
  assert.deepEqual(sparklinePoints([], 100, 40), []);
});

test("единственная точка встаёт в центр прямоугольника", () => {
  const points = sparklinePoints([80], 100, 40);
  assert.deepEqual(points, [{ x: 50, y: 20 }]);
});

test("первая и последняя точки лежат на отступах по X", () => {
  const points = sparklinePoints([80, 81, 79, 82], 100, 40, 4);
  assert.equal(points[0].x, 4);
  assert.equal(points[points.length - 1].x, 96);
});

test("большему значению соответствует меньший Y — ось растёт вниз", () => {
  const points = sparklinePoints([70, 80], 100, 40, 0);
  assert.ok(points[1].y < points[0].y, "80 кг должно быть выше на графике, чем 70 кг");
});

test("плоский ряд рисуется прямой линией посередине", () => {
  const points = sparklinePoints([75, 75, 75], 100, 40, 0);
  for (const p of points) assert.equal(p.y, 20);
});

test("все точки укладываются в границы height", () => {
  const points = sparklinePoints([60, 95, 61, 94, 62], 120, 50, 5);
  for (const p of points) {
    assert.ok(p.y >= 5 - 1e-9 && p.y <= 45 + 1e-9, `y=${p.y} вне [5, 45]`);
  }
});

test("pointsToPolyline даёт строку вида «x,y x,y» с одним знаком после запятой", () => {
  const str = pointsToPolyline([{ x: 1, y: 2 }, { x: 3.456, y: 7.891 }]);
  assert.equal(str, "1.0,2.0 3.5,7.9");
});

test("pointsToArea замыкает линию вниз до базовой отметки", () => {
  const area = pointsToArea([{ x: 0, y: 10 }, { x: 10, y: 4 }, { x: 20, y: 8 }], 40);
  assert.equal(area, "M0.0,10.0 L10.0,4.0 L20.0,8.0 L20.0,40.0 L0.0,40.0 Z");
});

test("pointsToArea на падающем тренде не уводит заливку выше линии", () => {
  // Ради этого и заведена отдельная фигура: у <polyline fill> контур
  // замкнулся бы по прямой из последней точки в первую, и на снижении веса
  // закрашенной оказалась бы область над графиком, а не под ним.
  const area = pointsToArea([{ x: 0, y: 4 }, { x: 20, y: 16 }], 30);
  assert.ok(area.endsWith("L20.0,30.0 L0.0,30.0 Z"), area);
});

test("одна точка или пусто — фигуры нет", () => {
  assert.equal(pointsToArea([{ x: 1, y: 2 }], 10), "");
  assert.equal(pointsToArea([], 10), "");
});

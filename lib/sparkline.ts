// Геометрия мини-графика: превращает ряд чисел в координаты для SVG
// `<polyline>`. Отдельный модуль, а не код прямо в компоненте, — чтобы
// масштабирование (минимум/максимум, плоский ряд, единственная точка)
// проверялось тестами без рендера React. Графики в проекте рисуются SVG
// вручную (технические рамки Mini App v2), этот модуль — общая часть для
// тренда веса на «Сегодня» и, при необходимости, других мини-графиков.

export type SparklinePoint = { x: number; y: number };

/**
 * Раскладывает значения по прямоугольнику width×height с отступом padding.
 * Ось Y в SVG растёт вниз, поэтому большему значению соответствует меньший y.
 */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  padding = 4,
): SparklinePoint[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [{ x: width / 2, y: height / 2 }];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerHeight = height - padding * 2;
  const stepX = (width - padding * 2) / (values.length - 1);

  return values.map((value, index) => {
    // Плоский ряд (span = 0, например одинаковый вес несколько дней подряд)
    // рисуем прямой линией посередине — делить на ноль незачем.
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    return {
      x: padding + index * stepX,
      y: padding + (1 - ratio) * innerHeight,
    };
  });
}

/** Строка для атрибута `points` SVG-полилинии. */
export function pointsToPolyline(points: SparklinePoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/**
 * Та же линия, но замкнутая вниз до `baselineY` — под неё можно положить
 * градиентную заливку. Отдельная строка, а не заливка самой полилинии: у
 * `<polyline fill>` фигура замыкается по прямой от последней точки к первой,
 * и на падающем тренде заливка уезжает выше линии.
 *
 * Меньше двух точек — пустая строка: площадь под одной точкой не фигура, и
 * рисовать там нечего.
 */
export function pointsToArea(points: SparklinePoint[], baselineY: number): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return `${line} L${last.x.toFixed(1)},${baselineY.toFixed(1)} L${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
}

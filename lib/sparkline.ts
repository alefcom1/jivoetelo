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

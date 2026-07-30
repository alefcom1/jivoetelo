// Подготовка точек для SVG-графика тренда веса (экран «План», Mini App v2).
//
// Никаких библиотек графиков — их в проекте нет и не будет (технические
// рамки спеки Mini App v2), поэтому SVG собирается вручную: этот модуль
// считает координаты в пикселях, а компонент только рисует <polyline>.
// Логика вынесена отдельно, чтобы геометрию можно было проверить тестами без
// рендера DOM — так же как lib/pace.ts проверяется без формы.

import type { TrendPoint } from "./trend.ts";

export type ChartPoint = { x: number; y: number };

export type WeightChartInput = {
  width: number;
  height: number;
  /** Отступ от края SVG до самой линии, чтобы точки не срезались на границе. */
  padding?: number;
  /** Целевой вес пользователя, если задан — рисуется отдельной линией. */
  targetWeightKg?: number | null;
};

export type WeightChartResult = {
  /** Точки сглаженного тренда в пикселях — по одной на каждую запись. */
  points: ChartPoint[];
  /** Тот же массив, но в виде строки для атрибута points у <polyline>. */
  linePoints: string;
  /** Пиксельная координата последней точки — туда обычно ставят подпись. */
  lastPoint: ChartPoint | null;
  /** y-координата линии целевого веса или null, если цель не задана. */
  targetY: number | null;
  /** Нижняя и верхняя граница шкалы веса в кг — пригодится для подписей осей. */
  minKg: number;
  maxKg: number;
};

const DEFAULT_PADDING = 8;
/** Минимальный видимый разброс шкалы: у стабильного веса реальный разброс
 * может быть в граммах, и растягивать ось под него — значит рисовать шум как
 * драму. Полкилограмма — примерно точность бытовых весов. */
const MIN_SPREAD_KG = 0.5;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Строит геометрию графика по точкам сглаженного тренда. Возвращает null,
 * если рисовать нечего (после «меньше недели данных» вызывающая сторона
 * сюда обычно и не доходит, но пустой массив — валидный вход, а не ошибка).
 */
export function buildWeightChart(trend: TrendPoint[], input: WeightChartInput): WeightChartResult | null {
  if (trend.length === 0) return null;

  const padding = input.padding ?? DEFAULT_PADDING;
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const kgValues = trend.map((p) => p.trendKg);
  if (input.targetWeightKg != null) kgValues.push(input.targetWeightKg);
  const minObserved = Math.min(...kgValues);
  const maxObserved = Math.max(...kgValues);
  const mid = (minObserved + maxObserved) / 2;
  const spread = Math.max(maxObserved - minObserved, MIN_SPREAD_KG);
  // Шкала — это spread с запасом по 15% сверху и снизу от середины, а не от
  // наблюдённых крайних значений: иначе для стабильного веса (spread уже
  // упёрся в MIN_SPREAD_KG) запас добавлялся бы к почти нулевой разнице и
  // видимый диапазон всё равно остался бы почти нулевым.
  const halfRange = (spread * 1.3) / 2;
  const minKg = mid - halfRange;
  const maxKg = mid + halfRange;
  const kgRange = maxKg - minKg;

  function xFor(index: number): number {
    if (trend.length === 1) return padding + innerWidth / 2;
    return padding + (index / (trend.length - 1)) * innerWidth;
  }
  function yFor(kg: number): number {
    const ratio = (kg - minKg) / kgRange;
    return padding + innerHeight * (1 - ratio);
  }

  const points = trend.map((point, index) => ({ x: round1(xFor(index)), y: round1(yFor(point.trendKg)) }));

  return {
    points,
    linePoints: points.map((p) => `${p.x},${p.y}`).join(" "),
    lastPoint: points[points.length - 1] ?? null,
    targetY: input.targetWeightKg != null ? round1(yFor(input.targetWeightKg)) : null,
    minKg: round1(minKg),
    maxKg: round1(maxKg),
  };
}

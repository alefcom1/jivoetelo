// Сглаженный тренд веса (раздел 14.3 спецификации): экспоненциальное
// сглаживание, чтобы смотреть на тренд, а не на дневной шум.

export type WeightPoint = { onDate: string; weightKg: number };
export type TrendPoint = WeightPoint & { trendKg: number };

const DEFAULT_ALPHA = 0.25;

export function weightTrend(entries: WeightPoint[], alpha = DEFAULT_ALPHA): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.onDate.localeCompare(b.onDate));
  const result: TrendPoint[] = [];
  let trend: number | null = null;
  for (const entry of sorted) {
    trend = trend === null ? entry.weightKg : trend + alpha * (entry.weightKg - trend);
    result.push({ ...entry, trendKg: Math.round(trend * 100) / 100 });
  }
  return result;
}

/**
 * Изменение тренда за последнюю неделю: разница между последним значением
 * тренда и значением ~7 дней назад. null, если данных меньше недели.
 */
export function weeklyTrendChange(trend: TrendPoint[]): number | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const lastDate = new Date(`${last.onDate}T12:00:00Z`).getTime();
  const weekAgo = lastDate - 7 * 24 * 60 * 60 * 1000;

  let reference: TrendPoint | null = null;
  for (const point of trend) {
    const t = new Date(`${point.onDate}T12:00:00Z`).getTime();
    if (t <= weekAgo && (!reference || t > new Date(`${reference.onDate}T12:00:00Z`).getTime())) {
      reference = point;
    }
  }
  if (!reference) return null;
  return Math.round((last.trendKg - reference.trendKg) * 100) / 100;
}

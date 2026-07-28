/** Быстрые множители порции в черновике разбора еды (веб и mini app). */

/** Умножает текущий вес порции на множитель, округляет до целых граммов и зажимает в 1..3000. */
export function scaleGrams(currentGrams: number, factor: number): number {
  const raw = currentGrams * factor;
  if (!Number.isFinite(raw)) return 1;
  return Math.min(3000, Math.max(1, Math.round(raw)));
}

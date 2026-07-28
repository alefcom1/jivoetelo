// Коридор нормы белка по весу тела. Значение `target` — та же величина, что
// `computeTargets(...).proteinTarget` в lib/targets.ts: это один и тот же
// расчёт, показанный в двух местах, и он не должен расходиться.

/** Граммов белка на килограмм веса. */
export const PROTEIN_PER_KG = { min: 1.2, target: 1.6, max: 2.0 };

export type ProteinRange = { min: number; target: number; max: number };

export function proteinRange(weightKg: number): ProteinRange {
  return {
    min: Math.round(PROTEIN_PER_KG.min * weightKg),
    target: Math.round(PROTEIN_PER_KG.target * weightKg),
    max: Math.round(PROTEIN_PER_KG.max * weightKg),
  };
}

// Цели по жирам и углеводам для экрана «Сегодня» в Mini App (раздел «Три
// отличия от макета» спецификации Mini App v2: отдельные полосы по белкам,
// жирам и углеводам, а не только по белку).
//
// `computeTargets` (lib/targets.ts) считает только калории, белок и
// клетчатку — жир и углеводы там сознательно не заведены, это отдельная
// сущность БД не заслуживает. Поэтому здесь целевые граммы жира и углеводов
// выводятся из уже посчитанных kcalTarget и proteinTarget, а не хранятся.
//
// Доля жира — 25–35% калорийности, общепринятый коридор (ВОЗ и профильные
// рекомендации). Берём середину, 30%. Углеводам достаётся остаток: белок и
// жир посчитаны в граммах, углеводы — то, что осталось от целевых калорий.

const FAT_SHARE_OF_KCAL = 0.3;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_CARBS = 4;

export type MacroSplit = { fatTarget: number; carbsTarget: number };

/**
 * Считает граммы жира и углеводов под уже известные kcalTarget и
 * proteinTarget. Жир зажат так, чтобы не превысить остаток после белка —
 * иначе на низкокалорийной цели с высоким белком (несовершеннолетние,
 * жёсткая нижняя граница) углеводы ушли бы в минус.
 */
export function splitMacroTargets(kcalTarget: number, proteinTarget: number): MacroSplit {
  const kcal = Math.max(0, kcalTarget);
  const proteinKcal = Math.max(0, proteinTarget) * KCAL_PER_G_PROTEIN;
  const fatKcal = Math.max(0, Math.min(kcal - proteinKcal, kcal * FAT_SHARE_OF_KCAL));
  const carbsKcal = Math.max(0, kcal - proteinKcal - fatKcal);

  return {
    fatTarget: Math.round(fatKcal / KCAL_PER_G_FAT),
    carbsTarget: Math.round(carbsKcal / KCAL_PER_G_CARBS),
  };
}

// Стартовые цели по формуле Миффлина-Сан Жеора (раздел 14.1 спецификации).
// Возвращаем диапазон, а не одно число: точность формулы этого не позволяет.

export type Goal = "lose" | "maintain" | "gain";
export type Activity = "sedentary" | "light" | "moderate" | "high";
export type SexForFormula = "female" | "male";

export type TargetInput = {
  goal: Goal;
  sexForFormula: SexForFormula;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
};

export type Targets = {
  kcalMin: number;
  kcalMax: number;
  proteinTarget: number;
  fiberTarget: number;
  /** Цель скорректирована из соображений безопасности (несовершеннолетние, нижняя граница). */
  adjusted: boolean;
};

export const TARGETS_VERSION = "mifflin-v1";

const ACTIVITY_MULTIPLIER: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

const GOAL_FACTOR: Record<Goal, number> = {
  lose: 0.85, // мягкий дефицит ~15%, без агрессивных целей (раздел 4.2)
  maintain: 1,
  gain: 1.1,
};

function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}

export function computeTargets(input: TargetInput, currentYear = new Date().getFullYear()): Targets {
  const age = Math.min(100, Math.max(14, currentYear - input.birthYear));

  // Безопасность (раздел 4.2): несовершеннолетним не выдаём цели на снижение веса.
  let goal = input.goal;
  let adjusted = false;
  if (age < 18 && goal === "lose") {
    goal = "maintain";
    adjusted = true;
  }

  const base =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * age + (input.sexForFormula === "male" ? 5 : -161);
  const tdee = base * (ACTIVITY_MULTIPLIER[input.activity] ?? ACTIVITY_MULTIPLIER.light);
  let target = tdee * GOAL_FACTOR[goal];

  // Жёсткая нижняя граница автоматических рекомендаций (раздел 4.2).
  const floor = input.sexForFormula === "male" ? 1500 : 1200;
  if (target < floor) {
    target = floor;
    adjusted = true;
  }

  return {
    kcalMin: roundTo10(target * 0.93),
    kcalMax: roundTo10(target * 1.07),
    proteinTarget: Math.round(1.6 * input.weightKg),
    fiberTarget: 25,
    adjusted,
  };
}

export const GOAL_LABELS: Record<Goal, string> = {
  lose: "Мягкое снижение веса",
  maintain: "Поддержание веса",
  gain: "Набор массы",
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "В основном сижу",
  light: "Лёгкая активность",
  moderate: "Регулярные тренировки",
  high: "Высокая активность",
};

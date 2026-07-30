// Стартовые цели по формуле Миффлина-Сан Жеора (раздел 14.1 спецификации).
// Возвращаем диапазон, а не одно число: точность формулы этого не позволяет.

import { computePace, type PaceKey } from "./pace.ts";

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
  /** Подтверждённая пользователем адаптивная корректировка (раздел 14.2). */
  adjustmentKcal?: number;
  /**
   * Темп снижения веса, выбранный на онбординге (lib/pace.ts). Это осознанная
   * цель по дефициту, заданная один раз на старте, — не путать с
   * adjustmentKcal выше, который сервис подстраивает по факту дневника.
   * Учитывается, только пока действующая цель — «снижение веса»: не задан
   * (undefined/null) — дефицит считается как раньше, плоскими 15%
   * (GOAL_FACTOR.lose), это ровно старое поведение для профилей без темпа.
   */
  pace?: PaceKey | null;
};

export type Targets = {
  /**
   * Наиболее вероятное значение. Показываем его вместе с диапазоном, а не
   * вместо: точка помогает сориентироваться, диапазон удерживает от веры в
   * точность, которой у формулы нет.
   */
  kcalTarget: number;
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

/**
 * Суточный расход до поправки на цель. Вынесено отдельно, потому что от него
 * считается не только норма, но и темп снижения веса (lib/pace.ts): дефицит
 * имеет смысл мерить долей от расхода, а не долей от веса.
 */
export function computeTdee(
  input: Pick<TargetInput, "sexForFormula" | "birthYear" | "heightCm" | "weightKg" | "activity">,
  currentYear = new Date().getFullYear(),
): number {
  const age = Math.min(100, Math.max(14, currentYear - input.birthYear));
  const base =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * age + (input.sexForFormula === "male" ? 5 : -161);
  return base * (ACTIVITY_MULTIPLIER[input.activity] ?? ACTIVITY_MULTIPLIER.light);
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

  const tdee = computeTdee(input, currentYear);
  const adjustment = Math.min(450, Math.max(-450, input.adjustmentKcal ?? 0));

  // Дефицит для снижения веса — либо выбранный темп (lib/pace.ts умеет сам
  // ограничивать его по доле расхода и по абсолютным потолкам), либо, если
  // темп не задан, прежние плоские 15% (GOAL_FACTOR.lose). Второй путь ничем
  // не отличается от расчёта до появления lib/onboarding.ts — это защищает
  // существующие профили без темпа от любых изменений в цифрах.
  const deficitBase =
    goal === "lose" && input.pace ? computePace({ weightKg: input.weightKg, tdeeKcal: tdee, pace: input.pace }).kcalTarget : tdee * GOAL_FACTOR[goal];
  let target = deficitBase + adjustment;

  // Жёсткая нижняя граница автоматических рекомендаций (раздел 4.2).
  const floor = input.sexForFormula === "male" ? 1500 : 1200;
  if (target < floor) {
    target = floor;
    adjusted = true;
  }

  return {
    kcalTarget: roundTo10(target),
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

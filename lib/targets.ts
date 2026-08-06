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
  /**
   * Своя норма вместо расчётной: её назначил врач, тренер или сам человек.
   *
   * Перекрывает всё — формулу, темп, адаптивную поправку. Единственное, что
   * остаётся, — нижняя граница безопасности: 1200/1500 ккал. Ниже неё сервис
   * не показывает цель ни при каких обстоятельствах, потому что это уже не
   * настройка, а вред, а мы не знаем, кто и зачем ввёл это число.
   *
   * Диапазон при этом схлопывается в точку. Диапазон здесь — честная оценка
   * неточности формулы; к числу, названному человеком, эта неточность
   * отношения не имеет, и растягивать его в «1670–1930» значило бы
   * приписывать врачу то, чего он не говорил.
   */
  kcalOverride?: number | null;
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
  /**
   * Откуда взялось число. Нужно интерфейсу: «посчитано по формуле» и «вы
   * задали сами» — разные вещи, и предлагать адаптивную поправку ко второму
   * бессмысленно.
   */
  source: "formula" | "manual";
};

/**
 * Шаг расчёта нормы — для объяснения, откуда взялось число.
 *
 * Раньше норма появлялась на экране без единого слова о происхождении, и это
 * было единственное место в продукте, где мы просили верить на слово. Для
 * сервиса, который отказался от ложной точности, это странно вдвойне: мы
 * показываем диапазон, потому что не уверены, — но не говорим, в чём именно.
 */
export type TargetStep = {
  /** Что произошло на этом шаге. */
  label: string;
  /** Значение после шага, ккал. */
  kcal: number;
  /** Почему так, если это неочевидно. */
  note?: string;
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
  return explainTargets(input, currentYear).targets;
}

/**
 * То же, что computeTargets, но с разбором по шагам: что из чего получилось.
 *
 * Отдельной функцией, а не полем в Targets: разбор нужен одному экрану
 * настроек, а цели — всему приложению, и таскать за ними список строк по всем
 * вызовам незачем.
 */
export function explainTargets(
  input: TargetInput,
  currentYear = new Date().getFullYear(),
): { targets: Targets; steps: TargetStep[] } {
  const age = Math.min(100, Math.max(14, currentYear - input.birthYear));
  const floor = input.sexForFormula === "male" ? 1500 : 1200;
  const steps: TargetStep[] = [];

  // Своя норма перекрывает расчёт целиком — считать формулу незачем, а вот
  // нижнюю границу применяем и к ней: см. комментарий у kcalOverride.
  if (input.kcalOverride != null && Number.isFinite(input.kcalOverride)) {
    const wanted = Math.round(input.kcalOverride);
    const capped = Math.max(floor, wanted);
    steps.push({ label: "Ваша норма", kcal: wanted, note: "задана вручную — формула не применяется" });
    if (capped !== wanted) {
      steps.push({
        label: "Нижняя граница безопасности",
        kcal: capped,
        note: `ниже ${floor} ккал сервис цель не показывает`,
      });
    }
    return {
      targets: {
        kcalTarget: capped,
        // Диапазон схлопнут: неточность формулы к названному человеком числу
        // отношения не имеет.
        kcalMin: capped,
        kcalMax: capped,
        proteinTarget: Math.round(1.6 * input.weightKg),
        fiberTarget: 25,
        adjusted: capped !== wanted,
        source: "manual",
      },
      steps,
    };
  }

  // Безопасность (раздел 4.2): несовершеннолетним не выдаём цели на снижение веса.
  let goal = input.goal;
  let adjusted = false;
  if (age < 18 && goal === "lose") {
    goal = "maintain";
    adjusted = true;
  }

  const tdee = computeTdee(input, currentYear);
  steps.push({
    label: "Расход по формуле Миффлина–Сан Жеора",
    kcal: roundTo10(tdee),
    note: `рост ${input.heightCm} см, вес ${input.weightKg} кг, возраст ${age}, активность «${ACTIVITY_LABELS[input.activity] ?? "средняя"}»`,
  });
  if (adjusted) {
    steps.push({ label: "Цель заменена на поддержание", kcal: roundTo10(tdee), note: "до 18 лет снижение веса не предлагаем" });
  }

  const adjustment = Math.min(450, Math.max(-450, input.adjustmentKcal ?? 0));

  // Дефицит для снижения веса — либо выбранный темп (lib/pace.ts умеет сам
  // ограничивать его по доле расхода и по абсолютным потолкам), либо, если
  // темп не задан, прежние плоские 15% (GOAL_FACTOR.lose). Второй путь ничем
  // не отличается от расчёта до появления lib/onboarding.ts — это защищает
  // существующие профили без темпа от любых изменений в цифрах.
  const byPace = goal === "lose" && input.pace;
  const deficitBase =
    byPace ? computePace({ weightKg: input.weightKg, tdeeKcal: tdee, pace: input.pace! }).kcalTarget : tdee * GOAL_FACTOR[goal];
  steps.push({
    label: `Поправка на цель: ${GOAL_LABELS[goal].toLowerCase()}`,
    kcal: roundTo10(deficitBase),
    note: byPace ? "по выбранному темпу снижения" : `${Math.round((GOAL_FACTOR[goal] - 1) * 100)}% от расхода`,
  });

  let target = deficitBase + adjustment;
  if (adjustment !== 0) {
    steps.push({
      label: "Адаптивная поправка",
      kcal: roundTo10(target),
      note: "накоплена по вашим записям и весу, вы её подтверждали",
    });
  }

  // Жёсткая нижняя граница автоматических рекомендаций (раздел 4.2).
  if (target < floor) {
    target = floor;
    adjusted = true;
    steps.push({
      label: "Нижняя граница безопасности",
      kcal: floor,
      note: `ниже ${floor} ккал сервис цель не показывает`,
    });
  }

  return {
    targets: {
      kcalTarget: roundTo10(target),
      kcalMin: roundTo10(target * 0.93),
      kcalMax: roundTo10(target * 1.07),
      proteinTarget: Math.round(1.6 * input.weightKg),
      fiberTarget: 25,
      adjusted,
      source: "formula",
    },
    steps,
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

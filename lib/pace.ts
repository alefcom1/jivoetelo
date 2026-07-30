// Темп снижения веса: сколько килограммов в неделю имеет смысл терять и
// какой дефицит за этим стоит.
//
// Почему это отдельный расчёт, а не множитель в targets.ts. Там дефицит
// задан плоскими 15% (`GOAL_FACTOR.lose = 0.85`) — разумное умолчание, но оно
// ничего не говорит человеку о том, сколько это в неделях и чем он платит за
// спешку. А главное, привычный способ ставить цель — «процент веса в неделю»
// — при одинаковом проценте даёт очень разную нагрузку. Терять 1% в неделю
// при 60 кг — это дефицит около 1100 ккал на расход порядка 2000, то есть
// больше половины. При 110 кг тот же процент — около 1900 ккал на расход
// порядка 3000. Проценты одинаковые, самочувствие несопоставимое, потому что
// расход растёт с весом медленнее, чем сам вес.
//
// Поэтому здесь считается не только абсолютный дефицит, но и относительный —
// доля от суточного расхода. Ограничения ставятся по нему и по двум жёстким
// потолкам, а не по проценту веса.
//
// Источник цифр: метаанализ Murphy & Koehler (2021) по потерям мышечной
// массы при разных дефицитах. Ниже примерно 500 ккал в день потери мышц в
// среднем не наблюдается, местами возможна рекомпозиция; выше — потери растут
// вместе с дефицитом.

/** Сколько энергии стоит килограмм массы тела. Классическая оценка. */
const KCAL_PER_KG = 7700;

/** Выше этого дефицита потери мышечной массы становятся заметными. */
export const MUSCLE_SAFE_DEFICIT = 500;

/** Потолки, за которыми диета перестаёт быть выполнимой для большинства. */
export const MAX_KG_PER_WEEK = 1;
export const MAX_DAILY_DEFICIT = 1000;
export const MAX_RELATIVE_DEFICIT = 0.3;

export type PaceKey = "very_gentle" | "gentle" | "moderate" | "brisk";

export type PaceOption = {
  key: PaceKey;
  label: string;
  /** Доля веса тела в неделю. */
  share: number;
  /** Что человек за это получает и чем платит — одной фразой. */
  note: string;
};

/**
 * Четыре темпа вместо пяти. Самый быстрый из общепринятой шкалы (1,5% веса в
 * неделю) сюда не вынесен намеренно: он почти всегда упирается в потолок по
 * относительному дефициту, и предлагать выбор, который тут же урезается, —
 * это обещать то, чего не будет.
 */
export const PACE_OPTIONS: PaceOption[] = [
  {
    key: "very_gentle",
    label: "Очень мягкий",
    share: 0.001,
    note: "Почти незаметно в еде. Подходит, когда важнее не сбиться, чем прийти быстро.",
  },
  {
    key: "gentle",
    label: "Мягкий",
    share: 0.0025,
    note: "Мышцы сохраняются уверенно, самочувствие обычно не меняется.",
  },
  {
    key: "moderate",
    label: "Умеренный",
    share: 0.006,
    note: "Обычный рабочий темп: заметный результат при терпимом дефиците.",
  },
  {
    key: "brisk",
    label: "Быстрый",
    share: 0.01,
    note: "Быстрее, но голоднее, и часть потерянного может оказаться мышцами.",
  },
];

export type PaceInput = {
  weightKg: number;
  /** Суточный расход. Берётся из того же расчёта, что и норма энергии. */
  tdeeKcal: number;
  pace: PaceKey;
  /** Сколько килограммов человек хочет сбросить. Нужно только для срока. */
  targetLossKg?: number;
};

export type PaceLimit = "relative" | "absolute_kcal" | "absolute_kg";

export type PaceResult = {
  kgPerWeek: number;
  dailyDeficit: number;
  /** Доля дефицита от суточного расхода: 0.2 — это минус пятая часть. */
  relativeDeficit: number;
  kcalTarget: number;
  /** Недель до цели, если она задана. */
  weeksToGoal: number | null;
  /** Темп пришлось урезать — и вот чем именно. */
  limitedBy: PaceLimit | null;
  /** Дефицит в зоне, где мышцы в среднем сохраняются. */
  musclePreserved: boolean;
};

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Считает темп и то, во что он обходится. Урезает запрошенный темп, если тот
 * выходит за потолки, и честно называет причину: молча выдать более медленный
 * результат хуже, чем объяснить, почему быстрее не стоит.
 */
export function computePace(input: PaceInput): PaceResult {
  const weightKg = Math.max(30, Math.min(300, input.weightKg));
  const tdeeKcal = Math.max(1000, Math.min(6000, input.tdeeKcal));
  const option = PACE_OPTIONS.find((o) => o.key === input.pace) ?? PACE_OPTIONS[1];

  const requested = weightKg * option.share;

  // Три потолка, каждый в килограммах в неделю, чтобы можно было сравнить.
  const byRelative = (MAX_RELATIVE_DEFICIT * tdeeKcal * 7) / KCAL_PER_KG;
  const byDailyKcal = (MAX_DAILY_DEFICIT * 7) / KCAL_PER_KG;

  let kgPerWeek = requested;
  let limitedBy: PaceLimit | null = null;
  for (const [limit, cap] of [
    ["relative", byRelative],
    ["absolute_kcal", byDailyKcal],
    ["absolute_kg", MAX_KG_PER_WEEK],
  ] as Array<[PaceLimit, number]>) {
    if (cap < kgPerWeek) {
      kgPerWeek = cap;
      limitedBy = limit;
    }
  }

  const dailyDeficit = (kgPerWeek * KCAL_PER_KG) / 7;
  const targetLossKg = input.targetLossKg && input.targetLossKg > 0 ? input.targetLossKg : null;

  return {
    kgPerWeek: round(kgPerWeek, 0.05),
    dailyDeficit: round(dailyDeficit, 10),
    relativeDeficit: dailyDeficit / tdeeKcal,
    kcalTarget: round(tdeeKcal - dailyDeficit, 10),
    weeksToGoal: targetLossKg ? Math.ceil(targetLossKg / kgPerWeek) : null,
    limitedBy,
    musclePreserved: dailyDeficit <= MUSCLE_SAFE_DEFICIT,
  };
}

export const LIMIT_REASONS: Record<PaceLimit, string> = {
  relative:
    "Этот темп потребовал бы урезать больше трети суточного расхода. Мы уменьшили его: такой дефицит выдерживают немногие и недолго.",
  absolute_kcal:
    "Дефицит вышел за 1000 ккал в день. Мы уменьшили темп: дальше диета перестаёт быть выполнимой почти для всех.",
  absolute_kg:
    "Больше килограмма в неделю мы не рекомендуем никому — независимо от веса и расчётов.",
};

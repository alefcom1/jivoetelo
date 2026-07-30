// Пошаговый онбординг (M3 v2, docs/market-research.md, раздел 2): вместо одной
// длинной формы — короткие экраны по одному вопросу, и план виден сразу, как
// только для него хватает данных, а дальше обновляется на каждый следующий
// ответ. Это единственная причина, по которой пошаговый онбординг вообще
// убедительнее одностраничного — если бы план не менялся на глазах, разбивка
// на экраны была бы просто неудобством.
//
// Всё, что решает «какой сейчас шаг», «виден ли уже план» и «нужно ли
// смягчить цель по безопасности», живёт здесь как чистые функции от
// накопленных ответов. Компонент (app/app/onboarding/onboarding-flow.tsx)
// только вызывает их и рисует результат — так же, как lib/pace.ts не знает о
// разметке, а pace-form.tsx не знает о формуле.

import {
  ACTIVITY_LABELS,
  computeTargets,
  computeTdee,
  GOAL_LABELS,
  type Activity,
  type Goal,
  type SexForFormula,
  type Targets,
} from "./targets.ts";
import { computePace, PACE_OPTIONS, type PaceKey, type PaceResult } from "./pace.ts";
import type { QuizAnswers } from "./quiz.ts";

/**
 * Тот же словарь, что в квизе «стоит ли снижать вес» (lib/quiz.ts) — по
 * существу это один и тот же вопрос про текущие отношения с едой, и разные
 * названия для одного понятия только запутывали бы.
 */
export type Relationship = QuizAnswers["relationship"];

export type OnboardingAnswers = {
  goal?: Goal;
  relationship?: Relationship;
  sexForFormula?: SexForFormula;
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  activity?: Activity;
  pace?: PaceKey;
  /** Сколько кг хочет сбросить — нужно только чтобы посчитать срок в предпросмотре, в профиль не сохраняется. */
  targetLossKg?: number;
};

export type OnboardingStepId =
  | "goal"
  | "relationship"
  | "sex"
  | "birthYear"
  | "height"
  | "weight"
  | "activity"
  | "pace"
  | "summary";

/**
 * Полный порядок шагов, как если бы ни один не пропускался. Нужен только
 * навигации (resolveCurrentStep, когда текущий шаг исчез) — реальный список
 * для конкретных ответов всегда даёт visibleSteps.
 */
export const ALL_STEPS: OnboardingStepId[] = [
  "goal", "relationship", "sex", "birthYear", "height", "weight", "activity", "pace", "summary",
];

export const STEP_CAPTIONS: Record<OnboardingStepId, string> = {
  goal: "Цель",
  relationship: "Отношения с едой",
  sex: "Пол для формулы",
  birthYear: "Год рождения",
  height: "Рост",
  weight: "Вес",
  activity: "Активность",
  pace: "Темп",
  summary: "Ваш план",
};

// Границы значений — те же, что у v1-онбординга (app/app/profile-actions.ts)
// и калькуляторов в app/raschet: то, что тут разрешено ввести, должно без
// отказа проходить серверную валидацию в конце — иначе человек проходит весь
// путь и на последнем шаге натыкается на «проверьте значения».
export const MIN_HEIGHT_CM = 120;
export const MAX_HEIGHT_CM = 230;
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;
export const MAX_TARGET_LOSS_KG = 80;
const ADULT_AGE = 18;
const MAX_AGE = 100;
const MIN_AGE_FOR_FORM = 14; // младше формула не считает, см. computeTdee

export function minBirthYear(currentYear: number): number {
  return currentYear - MAX_AGE;
}

export function maxBirthYear(currentYear: number): number {
  return currentYear - MIN_AGE_FOR_FORM;
}

const DEFAULT_ACTIVITY: Activity = "light";

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  calm: "Спокойно, без особых сложностей",
  tense: "Иногда напряжённо — бывают срывы или чувство вины",
  hard: "Еда занимает много мыслей почти каждый день",
};

export function isMinor(answers: OnboardingAnswers, currentYear = new Date().getFullYear()): boolean {
  if (answers.birthYear === undefined) return false;
  return currentYear - answers.birthYear < ADULT_AGE;
}

/**
 * Эффективная цель — та, что реально уходит в расчёт (computeTargets
 * получает именно её, не answers.goal напрямую). Отличается от выбора
 * пользователя в двух случаях безопасности: несовершеннолетний возраст и
 * тяжёлые отношения с едой. Первое правило уже есть в lib/targets.ts —
 * дублируем его здесь, потому что от него зависит не только число, но и то,
 * показывать ли вообще шаг «темп» (см. visibleSteps). Второе — правило
 * продукта поверх формулы: lib/targets.ts ничего не знает про РПП, поэтому
 * дефицит для этого случая смягчается уже тут, а не внутри формулы.
 */
export function effectiveGoal(answers: OnboardingAnswers, currentYear = new Date().getFullYear()): Goal {
  const goal = answers.goal ?? "maintain";
  if (goal !== "lose") return goal;
  if (isMinor(answers, currentYear)) return "maintain";
  if (answers.relationship === "hard") return "maintain";
  return "lose";
}

/** Все ли обязательные для конкретного шага данные уже введены и в границах — от этого зависит, активна ли кнопка «Далее». */
export function isStepComplete(
  step: OnboardingStepId,
  answers: OnboardingAnswers,
  currentYear = new Date().getFullYear(),
): boolean {
  switch (step) {
    case "goal":
      return answers.goal !== undefined;
    case "relationship":
      return answers.relationship !== undefined;
    case "sex":
      return answers.sexForFormula !== undefined;
    case "birthYear":
      return (
        answers.birthYear !== undefined &&
        answers.birthYear >= minBirthYear(currentYear) &&
        answers.birthYear <= maxBirthYear(currentYear)
      );
    case "height":
      return answers.heightCm !== undefined && answers.heightCm >= MIN_HEIGHT_CM && answers.heightCm <= MAX_HEIGHT_CM;
    case "weight":
      return answers.weightKg !== undefined && answers.weightKg >= MIN_WEIGHT_KG && answers.weightKg <= MAX_WEIGHT_KG;
    case "activity":
      return answers.activity !== undefined;
    case "pace":
      return answers.pace !== undefined;
    case "summary":
      return true;
  }
}

/**
 * Хватает ли данных, чтобы вообще что-то посчитать, — момент, когда план
 * впервые появляется в предпросмотре. Активность в список не входит: у неё
 * есть безопасное умолчание (см. deriveLivePlan), и план должен появиться
 * раньше, чем на активность дойдёт очередь, — иначе весь смысл «живого»
 * предпросмотра теряется.
 */
export function canShowPlan(answers: OnboardingAnswers, currentYear = new Date().getFullYear()): boolean {
  return (
    isStepComplete("sex", answers, currentYear) &&
    isStepComplete("birthYear", answers, currentYear) &&
    isStepComplete("height", answers, currentYear) &&
    isStepComplete("weight", answers, currentYear)
  );
}

/**
 * Какие шаги вообще показывать при текущих ответах. Условен пока только один
 * — «темп»: он имеет смысл, только если план в итоге предполагает дефицит, а
 * не просто потому что человек в какой-то момент отметил «снижение веса».
 * Поэтому условие — effectiveGoal, а не answers.goal: несовершеннолетнему или
 * человеку с тяжёлыми отношениями с едой выбирать темп снижения незачем,
 * если дефицита всё равно не будет.
 */
export function visibleSteps(answers: OnboardingAnswers, currentYear = new Date().getFullYear()): OnboardingStepId[] {
  const steps: OnboardingStepId[] = ["goal", "relationship", "sex", "birthYear", "height", "weight", "activity"];
  if (effectiveGoal(answers, currentYear) === "lose") steps.push("pace");
  steps.push("summary");
  return steps;
}

/**
 * Шаг мог исчезнуть, пока человек на нём стоял (типичный случай — стоял на
 * «темпе», вернулся на «цель» и передумал снижать вес). Тогда остаёмся на
 * ближайшем предыдущем из ещё видимых шагов, а не улетаем в начало: это
 * ощущается как «одна кнопка назад отменяет один ответ», а не как сброс
 * прогресса.
 */
export function resolveCurrentStep(
  step: OnboardingStepId,
  answers: OnboardingAnswers,
  currentYear = new Date().getFullYear(),
): OnboardingStepId {
  const steps = visibleSteps(answers, currentYear);
  if (steps.includes(step)) return step;
  const fallbackFrom = ALL_STEPS.indexOf(step);
  for (let i = fallbackFrom - 1; i >= 0; i--) {
    if (steps.includes(ALL_STEPS[i])) return ALL_STEPS[i];
  }
  return steps[0];
}

export function nextStep(
  step: OnboardingStepId,
  answers: OnboardingAnswers,
  currentYear = new Date().getFullYear(),
): OnboardingStepId | null {
  const steps = visibleSteps(answers, currentYear);
  const idx = steps.indexOf(resolveCurrentStep(step, answers, currentYear));
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
}

export function previousStep(
  step: OnboardingStepId,
  answers: OnboardingAnswers,
  currentYear = new Date().getFullYear(),
): OnboardingStepId | null {
  const steps = visibleSteps(answers, currentYear);
  const idx = steps.indexOf(resolveCurrentStep(step, answers, currentYear));
  return idx > 0 ? steps[idx - 1] : null;
}

/** 1-based индекс текущего шага и общее число видимых шагов — для полоски прогресса. */
export function stepProgress(
  step: OnboardingStepId,
  answers: OnboardingAnswers,
  currentYear = new Date().getFullYear(),
): { index: number; total: number } {
  const steps = visibleSteps(answers, currentYear);
  const idx = steps.indexOf(resolveCurrentStep(step, answers, currentYear));
  return { index: idx + 1, total: steps.length };
}

export type SafetyReason = "minor" | "hard_relationship" | "kcal_floor";

export const SAFETY_NOTES: Record<SafetyReason, string> = {
  minor:
    "До 18 лет мы не выдаём целей на снижение веса — план ниже посчитан на поддержание. Питание в этом возрасте стоит обсуждать с врачом, а не с калькулятором.",
  hard_relationship:
    "Судя по ответу, еда сейчас непростая тема — мы посчитали план на поддержание, без дефицита. Если тема забирает много сил, это повод поговорить со специалистом по расстройствам пищевого поведения, а не подстраивать цифры плана.",
  kcal_floor:
    "Мы подняли расчёт до безопасного минимума. Ниже этой границы автоматические рекомендации не выдаём.",
};

export type LivePlan = {
  targets: Targets;
  tdeeKcal: number;
  effectiveGoal: Goal;
  /**
   * Темп, который реально уйдёт в computeTargets (undefined, если цель не
   * «снижение веса» или темп ещё не выбран). Это и есть то самое поле,
   * которое связывает предпросмотр с сохранённым планом — kcalAdjustment
   * (раздел 14.2) в этой связке не участвует и остаётся нетронутым.
   */
  pace: PaceKey | undefined;
  /** Развёрнутый результат computePace — для «кг в неделю» и срока в предпросмотре; сама цель уже учтена в targets.kcalTarget через computeTargets. */
  paceDetails: PaceResult | null;
  ageSoftened: boolean;
  relationshipSoftened: boolean;
  /** Активность ещё не выбрана — план посчитан по умолчанию (light); это стоит показать честно, а не выдавать предварительную оценку за точную. */
  usingDefaultActivity: boolean;
};

/**
 * Центральная функция «живого пересчёта». Возвращает null, пока данных не
 * хватает (canShowPlan), а дальше пересчитывается заново на каждый ответ —
 * отдельного состояния «план» нигде не хранится, оно всегда выводится из
 * answers, точно как targets в energy-form.tsx выводятся из values.
 *
 * Тёмп передаётся в computeTargets как есть (поле TargetInput.pace) — тем же
 * путём, каким его позже сохраняет форма (profiles.pace). Никакой отдельной
 * арифметики здесь больше нет: computeTargets сам решает, взять ли дефицит из
 * lib/pace.ts или использовать прежние плоские 15% (GOAL_FACTOR.lose), когда
 * темп не выбран. Это гарантирует, что число в предпросмотре и число,
 * которое дальше увидит человек на «Сегодня» после сохранения профиля, — одно
 * и то же: оба считаются одной функцией с одними и теми же входами.
 */
export function deriveLivePlan(answers: OnboardingAnswers, currentYear = new Date().getFullYear()): LivePlan | null {
  if (!canShowPlan(answers, currentYear)) return null;

  const goal = effectiveGoal(answers, currentYear);
  const ageSoftened = answers.goal === "lose" && isMinor(answers, currentYear);
  const relationshipSoftened = answers.goal === "lose" && answers.relationship === "hard";

  const base = {
    sexForFormula: answers.sexForFormula!,
    birthYear: answers.birthYear!,
    heightCm: answers.heightCm!,
    weightKg: answers.weightKg!,
    activity: answers.activity ?? DEFAULT_ACTIVITY,
  };

  const tdeeKcal = computeTdee(base, currentYear);

  // Темп имеет смысл только пока действующая цель — снижение веса: для
  // смягчённой (несовершеннолетний, тяжёлые отношения с едой) или для
  // «поддержания»/«набора» отправлять его в расчёт незачем — computeTargets
  // и сам бы его проигнорировал (там та же проверка goal === "lose"), но
  // явная отсечка здесь избавляет paceDetails ниже от лишней работы.
  const pace = goal === "lose" ? answers.pace : undefined;
  const targets = computeTargets({ ...base, goal, pace }, currentYear);

  let paceDetails: PaceResult | null = null;
  if (pace) {
    const targetLossKg =
      answers.targetLossKg !== undefined && answers.targetLossKg > 0 && answers.targetLossKg <= MAX_TARGET_LOSS_KG
        ? answers.targetLossKg
        : undefined;
    paceDetails = computePace({ weightKg: base.weightKg, tdeeKcal, pace, targetLossKg });
  }

  return {
    targets,
    tdeeKcal,
    effectiveGoal: goal,
    pace,
    paceDetails,
    ageSoftened,
    relationshipSoftened,
    usingDefaultActivity: answers.activity === undefined,
  };
}

/**
 * Причины смягчения плана — для баннеров у предпросмотра и на итоговом шаге.
 * Три пункта независимы и могут прийти вместе (например, несовершеннолетний
 * с маленьким весом попадает и в «minor», и в «kcal_floor» — это разные факты
 * про один и тот же план, оба стоит показать, а не выбирать один).
 */
export function planSafetyReasons(plan: LivePlan): SafetyReason[] {
  const reasons: SafetyReason[] = [];
  if (plan.ageSoftened) reasons.push("minor");
  if (plan.relationshipSoftened) reasons.push("hard_relationship");
  if (plan.targets.adjusted) reasons.push("kcal_floor");
  return reasons;
}

// ===== Сохранение профиля (используется и первым онбордингом, и повторным
// проходом через «Изменить план» в настройках — app/app/profile-actions.ts) =====

/** Допустимые значения — списки берём из тех же словарей, что рисуют шаги «цель» и «активность», чтобы не заводить третий источник истины. */
const GOALS = Object.keys(GOAL_LABELS) as Goal[];
const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as Activity[];
const SEXES: SexForFormula[] = ["female", "male"];
const PACE_KEYS: PaceKey[] = PACE_OPTIONS.map((option) => option.key);

export type ProfileFormValues = {
  goal: Goal;
  sexForFormula: SexForFormula;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  /** null — темп не выбирали (цель не «снижение веса» или профиль заведён до онбординга v2). Законное состояние, не ошибка. */
  pace: PaceKey | null;
};

/** Сырые строки прямо из FormData.get(...) — до какой-либо проверки. */
export type ProfileFormInput = {
  goal: string;
  sexForFormula: string;
  activity: string;
  birthYear: string;
  heightCm: string;
  weightKg: string;
  pace: string;
};

/**
 * Разбирает и валидирует форму сохранения профиля. Чистая функция — её можно
 * проверить без БД и без server action вокруг неё, а server action
 * (saveProfile) становится тонкой обвязкой: распаковать FormData, вызвать
 * это, записать результат.
 *
 * Намеренно не знает про kcalAdjustment. Это не пропуск, а гарантия: раздел
 * 14.2 отдаёт накопленную адаптивную поправку исключительно
 * applyProposedAdjustment, и то, что в возвращаемом типе для неё просто нет
 * места, защищает от случая, когда кто-то в будущем добавит в форму лишнее
 * поле и повторный проход онбординга («Изменить план») тихо обнулит недели
 * адаптивной подстройки — ровно то, что раньше уже один раз случилось.
 */
export function parseProfileForm(
  input: ProfileFormInput,
  currentYear = new Date().getFullYear(),
): ProfileFormValues | null {
  const birthYear = Number(input.birthYear);
  const heightCm = Number(input.heightCm);
  const weightKg = Number(input.weightKg);

  const valid =
    (GOALS as string[]).includes(input.goal) &&
    (SEXES as string[]).includes(input.sexForFormula) &&
    (ACTIVITIES as string[]).includes(input.activity) &&
    Number.isInteger(birthYear) && birthYear >= minBirthYear(currentYear) && birthYear <= maxBirthYear(currentYear) &&
    Number.isFinite(heightCm) && heightCm >= MIN_HEIGHT_CM && heightCm <= MAX_HEIGHT_CM &&
    Number.isFinite(weightKg) && weightKg >= MIN_WEIGHT_KG && weightKg <= MAX_WEIGHT_KG;
  if (!valid) return null;

  // Темп необязателен и не входит в проверку valid выше: пусто или мусор — это
  // «не выбран», обычный и законный случай, а не повод отклонить всю форму.
  const pace = PACE_KEYS.includes(input.pace as PaceKey) ? (input.pace as PaceKey) : null;

  return {
    goal: input.goal as Goal,
    sexForFormula: input.sexForFormula as SexForFormula,
    activity: input.activity as Activity,
    birthYear,
    heightCm,
    weightKg,
    pace,
  };
}

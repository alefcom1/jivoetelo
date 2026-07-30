import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_STEPS,
  canShowPlan,
  deriveLivePlan,
  effectiveGoal,
  isStepComplete,
  maxBirthYear,
  minBirthYear,
  nextStep,
  parseProfileForm,
  planSafetyReasons,
  previousStep,
  resolveCurrentStep,
  stepProgress,
  visibleSteps,
} from "../lib/onboarding.ts";
import { PACE_OPTIONS } from "../lib/pace.ts";

const YEAR = 2026;

/** Взрослый человек с типичными параметрами — базовый набор ответов для тестов, где возраст и отношения с едой не в фокусе. */
const ADULT = {
  goal: "lose",
  relationship: "calm",
  sexForFormula: "female",
  birthYear: 1990,
  heightCm: 168,
  weightKg: 78,
  activity: "light",
};

test("шаги идут в фиксированном порядке: цель, отношения с едой, тело, активность, итог", () => {
  const steps = visibleSteps({ ...ADULT, goal: "maintain" }, YEAR);
  assert.deepEqual(steps, ["goal", "relationship", "sex", "birthYear", "height", "weight", "activity", "summary"]);
});

test("шаг темпа появляется только при цели «снижение веса»", () => {
  assert.ok(visibleSteps({ ...ADULT, goal: "lose" }, YEAR).includes("pace"));
  assert.ok(!visibleSteps({ ...ADULT, goal: "maintain" }, YEAR).includes("pace"));
  assert.ok(!visibleSteps({ ...ADULT, goal: "gain" }, YEAR).includes("pace"));
});

test("шаг темпа скрыт для несовершеннолетних, даже если выбрана цель «снижение веса»", () => {
  const minorAnswers = { ...ADULT, goal: "lose", birthYear: 2010 }; // 16 лет в 2026
  assert.ok(!visibleSteps(minorAnswers, YEAR).includes("pace"));
});

test("шаг темпа скрыт при тяжёлых отношениях с едой, даже у взрослых", () => {
  const hardAnswers = { ...ADULT, goal: "lose", relationship: "hard" };
  assert.ok(!visibleSteps(hardAnswers, YEAR).includes("pace"));
});

test("шаг темпа не пропадает из-за напряжённых, но не тяжёлых отношений с едой", () => {
  const tenseAnswers = { ...ADULT, goal: "lose", relationship: "tense" };
  assert.ok(visibleSteps(tenseAnswers, YEAR).includes("pace"));
});

test("несовершеннолетним цель «снижение веса» автоматически смягчается до «поддержания»", () => {
  assert.equal(effectiveGoal({ goal: "lose", birthYear: 2010 }, YEAR), "maintain");
  assert.equal(effectiveGoal({ goal: "lose", birthYear: 1990 }, YEAR), "lose");
});

test("тяжёлые отношения с едой смягчают цель до поддержания, даже у взрослых", () => {
  assert.equal(effectiveGoal({ goal: "lose", birthYear: 1990, relationship: "hard" }, YEAR), "maintain");
  assert.equal(effectiveGoal({ goal: "lose", birthYear: 1990, relationship: "tense" }, YEAR), "lose");
});

test("без ответа про цель эффективная цель считается поддержанием, а не потерей веса по умолчанию", () => {
  assert.equal(effectiveGoal({}, YEAR), "maintain");
});

test("план недоступен, пока не введены пол, год рождения, рост и вес", () => {
  assert.equal(canShowPlan({}, YEAR), false);
  assert.equal(canShowPlan({ sexForFormula: "female" }, YEAR), false);
  assert.equal(canShowPlan({ sexForFormula: "female", birthYear: 1990 }, YEAR), false);
  assert.equal(canShowPlan({ sexForFormula: "female", birthYear: 1990, heightCm: 168 }, YEAR), false);
  assert.equal(canShowPlan({ sexForFormula: "female", birthYear: 1990, heightCm: 168, weightKg: 78 }, YEAR), true);
});

test("план становится виден сразу после веса, не дожидаясь ответов про активность и темп", () => {
  const minimalAnswers = { goal: "maintain", sexForFormula: "female", birthYear: 1990, heightCm: 168, weightKg: 78 };
  const plan = deriveLivePlan(minimalAnswers, YEAR);
  assert.ok(plan !== null);
  assert.equal(plan.usingDefaultActivity, true);
  assert.ok(plan.targets.kcalTarget > 0);
});

test("план не появляется без роста или веса, даже если всё остальное заполнено", () => {
  const noHeight = { ...ADULT, heightCm: undefined };
  assert.equal(deriveLivePlan(noHeight, YEAR), null);
  const noWeight = { ...ADULT, weightKg: undefined };
  assert.equal(deriveLivePlan(noWeight, YEAR), null);
});

test("следующий шаг после цели — всегда отношения с едой, независимо от остальных ответов", () => {
  assert.equal(nextStep("goal", { goal: "lose" }, YEAR), "relationship");
  assert.equal(nextStep("goal", { goal: "gain" }, YEAR), "relationship");
});

test("возврат назад и повторный шаг вперёд приводят на тот же шаг", () => {
  const answers = { ...ADULT }; // цель «lose» — темп в маршруте есть
  const forward = nextStep("activity", answers, YEAR);
  assert.equal(forward, "pace");
  const back = previousStep(forward, answers, YEAR);
  assert.equal(back, "activity");
});

test("после последнего шага «Далее» никуда не ведёт", () => {
  assert.equal(nextStep("summary", ADULT, YEAR), null);
});

test("перед первым шагом «Назад» никуда не ведёт", () => {
  assert.equal(previousStep("goal", ADULT, YEAR), null);
});

test("если шаг темпа исчезает (передумали снижать вес), текущий шаг переезжает на активность, а не в начало", () => {
  const changedMind = { ...ADULT, goal: "maintain" };
  assert.equal(resolveCurrentStep("pace", changedMind, YEAR), "activity");
});

test("ALL_STEPS содержит каждый шаг ровно один раз — резервный порядок для resolveCurrentStep не должен ничего терять", () => {
  const unique = new Set(ALL_STEPS);
  assert.equal(unique.size, ALL_STEPS.length);
});

test("прогресс считается по видимым шагам, а не по полному списку", () => {
  const withPace = stepProgress("summary", { ...ADULT, goal: "lose" }, YEAR);
  const withoutPace = stepProgress("summary", { ...ADULT, goal: "maintain" }, YEAR);
  assert.equal(withPace.total, withoutPace.total + 1);
  assert.equal(withPace.index, withPace.total);
});

test("шаг «год рождения» недоступен для продолжения за границами допустимого возраста", () => {
  const year = YEAR;
  assert.equal(isStepComplete("birthYear", { birthYear: minBirthYear(year) - 1 }, year), false);
  assert.equal(isStepComplete("birthYear", { birthYear: minBirthYear(year) }, year), true);
  assert.equal(isStepComplete("birthYear", { birthYear: maxBirthYear(year) }, year), true);
  assert.equal(isStepComplete("birthYear", { birthYear: maxBirthYear(year) + 1 }, year), false);
});

test("нижняя граница калорий соблюдается даже при агрессивном сочетании маленького веса и быстрого темпа", () => {
  const small = { goal: "lose", relationship: "calm", sexForFormula: "female", birthYear: 1970, heightCm: 152, weightKg: 44, activity: "sedentary", pace: "brisk" };
  const plan = deriveLivePlan(small, YEAR);
  assert.ok(plan.targets.kcalMin >= 1200 * 0.93, `нижняя граница нарушена: ${plan.targets.kcalMin}`);
});

test("более быстрый темп не увеличивает дневную норму энергии", () => {
  let previousKcal = Infinity;
  for (const { key } of PACE_OPTIONS) {
    const plan = deriveLivePlan({ ...ADULT, goal: "lose", pace: key }, YEAR);
    assert.ok(plan.targets.kcalTarget <= previousKcal, `${key}: ${plan.targets.kcalTarget} после ${previousKcal}`);
    previousKcal = plan.targets.kcalTarget;
  }
});

test("выбранный темп уходит прямо в computeTargets и определяет kcalTarget предпросмотра", () => {
  const plan = deriveLivePlan({ ...ADULT, goal: "lose", pace: "moderate" }, YEAR);
  assert.equal(plan.pace, "moderate");
  assert.ok(plan.paceDetails !== null);
  // Оба числа считает один и тот же computeTargets({ ..., pace }), поэтому совпадение точное.
  assert.equal(plan.targets.kcalTarget, plan.paceDetails.kcalTarget);
});

test("без выбранного темпа план для снижения веса использует прежний плоский дефицит формулы", () => {
  const plan = deriveLivePlan({ ...ADULT, goal: "lose", pace: undefined }, YEAR);
  assert.equal(plan.pace, undefined);
  assert.equal(plan.paceDetails, null);
});

test("причины смягчения плана независимы и могут прийти вместе", () => {
  const minorWithHardRelationship = {
    goal: "lose",
    relationship: "hard",
    sexForFormula: "female",
    birthYear: 2010, // 16 лет
    heightCm: 160,
    weightKg: 55,
    activity: "light",
  };
  const plan = deriveLivePlan(minorWithHardRelationship, YEAR);
  const reasons = planSafetyReasons(plan);
  assert.ok(reasons.includes("minor"));
  assert.ok(reasons.includes("hard_relationship"));
});

test("у спокойного взрослого без упора в нижний порог причин смягчения нет", () => {
  const plan = deriveLivePlan(ADULT, YEAR);
  assert.deepEqual(planSafetyReasons(plan), []);
});

test("для цели «поддержание» или «набор массы» план не смягчается по возрасту или отношениям с едой", () => {
  const minorMaintain = { goal: "maintain", relationship: "hard", sexForFormula: "female", birthYear: 2010, heightCm: 160, weightKg: 55, activity: "light" };
  const plan = deriveLivePlan(minorMaintain, YEAR);
  assert.equal(plan.ageSoftened, false);
  assert.equal(plan.relationshipSoftened, false);
});

// ===== parseProfileForm — общая точка сохранения для первого онбординга и «Изменить план» =====

const VALID_FORM = {
  goal: "lose",
  sexForFormula: "female",
  activity: "light",
  birthYear: "1990",
  heightCm: "168",
  weightKg: "78",
  pace: "moderate",
};

test("корректная форма с выбранным темпом разбирается и сохраняет его как есть", () => {
  const parsed = parseProfileForm(VALID_FORM, YEAR);
  assert.ok(parsed !== null);
  assert.equal(parsed.pace, "moderate");
  assert.equal(parsed.goal, "lose");
  assert.equal(parsed.birthYear, 1990);
  assert.equal(parsed.heightCm, 168);
  assert.equal(parsed.weightKg, 78);
});

test("пустой или неизвестный темп разбирается как null, а не как ошибка всей формы", () => {
  assert.equal(parseProfileForm({ ...VALID_FORM, pace: "" }, YEAR).pace, null);
  assert.equal(parseProfileForm({ ...VALID_FORM, pace: "невесть что" }, YEAR).pace, null);
  assert.equal(parseProfileForm({ ...VALID_FORM, goal: "maintain", pace: "" }, YEAR).pace, null);
});

test("результат разбора формы никогда не содержит kcalAdjustment — повторный онбординг не может задеть накопленную адаптивную поправку", () => {
  const parsed = parseProfileForm(VALID_FORM, YEAR);
  assert.ok(!("kcalAdjustment" in parsed), `в разборе формы не должно быть kcalAdjustment: ${JSON.stringify(parsed)}`);
});

test("форма с недопустимым годом рождения отклоняется целиком, даже если темп указан корректно", () => {
  assert.equal(parseProfileForm({ ...VALID_FORM, birthYear: String(maxBirthYear(YEAR) + 1) }, YEAR), null);
  assert.equal(parseProfileForm({ ...VALID_FORM, birthYear: String(minBirthYear(YEAR) - 1) }, YEAR), null);
});

test("форма с недопустимым ростом или весом отклоняется целиком", () => {
  assert.equal(parseProfileForm({ ...VALID_FORM, heightCm: "50" }, YEAR), null);
  assert.equal(parseProfileForm({ ...VALID_FORM, weightKg: "0" }, YEAR), null);
});

test("форма с неизвестной целью или полом отклоняется целиком", () => {
  assert.equal(parseProfileForm({ ...VALID_FORM, goal: "cure_everything" }, YEAR), null);
  assert.equal(parseProfileForm({ ...VALID_FORM, sexForFormula: "other" }, YEAR), null);
});

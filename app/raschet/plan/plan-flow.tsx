"use client";

/**
 * Пошаговый расчёт плана — публичная замена воронке конкурентов вида
 * «-14 кг за 98 дней». Мы вместо даты показываем коридор (lib/fan.ts), а
 * вместо десятка полей формы — по одному вопросу на экран.
 *
 * Порядок совсем не случайный: пять вопросов безопасности (lib/safety.ts)
 * идут первыми, до единой цифры о теле, — это фильтр, а не сбор данных.
 * Дальше год рождения и возрастной стоп — тоже раньше роста и веса, чтобы
 * несовершеннолетнему их вообще не пришлось называть. Если тело
 * softeningReason сочло, что дефицит сейчас не ко времени, цель молча
 * подменяется на «поддержание» и расчёт идёт дальше как ни в чём не бывало:
 * это другой результат, а не отказ.
 *
 * Список видимых шагов и переходы между ними считаются заново на каждый
 * ответ (buildSteps/resolveCurrentStep) — так же, как это устроено в
 * app/app/onboarding/onboarding-flow.tsx, только здесь свой набор шагов и
 * свой порядок: та реализация лежит в app/app и рассчитана на другой поток
 * (там уже есть выбор цели и вопрос идёт после пола), сюда её не притянуть.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildFan, type Fan } from "@/lib/fan";
import { GOAL_PLAN_DONE, reachGoal } from "@/lib/goals";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { MAX_HEIGHT_CM, MAX_WEIGHT_KG, MIN_HEIGHT_CM, MIN_WEIGHT_KG } from "@/lib/onboarding";
import { PACE_OPTIONS, type PaceKey } from "@/lib/pace";
import { proteinRange, type ProteinRange } from "@/lib/protein";
import {
  softeningReason,
  SOFTENING_NOTES,
  type LifeLoad,
  type Motivation,
  type RecentDieting,
  type Relationship,
  type Sleep,
  type SofteningReason,
} from "@/lib/safety";
import { ACTIVITY_LABELS, computeTargets, type Activity, type Goal, type SexForFormula, type Targets } from "@/lib/targets";
import FanChart from "./fan-chart";

type Answers = {
  motivation?: Motivation;
  recentDieting?: RecentDieting;
  relationship?: Relationship;
  sleep?: Sleep;
  lifeLoad?: LifeLoad;
  birthYear?: number;
  sexForFormula?: SexForFormula;
  heightCm?: number;
  weightKg?: number;
  targetWeightKg?: number;
  activity?: Activity;
  pace?: PaceKey;
};

type StepId =
  | "motivation"
  | "recentDieting"
  | "relationship"
  | "sleep"
  | "lifeLoad"
  | "softening"
  | "birthYear"
  | "ageStop"
  | "sex"
  | "body"
  | "targetWeight"
  | "activity"
  | "pace"
  | "result";

// Тот же диапазон, что и у остальных калькуляторов раздела (energy-form.tsx,
// pace-form.tsx) — расчёт должен вести себя одинаково, откуда бы к нему ни
// пришли. Верхнюю границу считаем от текущего года: младше 14 лет формула
// вообще не определена (lib/targets.ts зажимает возраст снизу).
const MIN_BIRTH_YEAR = 1920;
const MIN_AGE_FOR_FORM = 14;
const ADULT_AGE = 18;
/**
 * Ниже этого возраста сервис не работает вовсе — так написано в политике
 * (`/legal/privacy`, раздел о несовершеннолетних). А между 14 и 18 расчёт
 * идёт полностью, только на поддержание: подростку незачем запрещать
 * смотреть, что он ест, запрещать нужно дефицит.
 */
const MIN_AGE = 14;

const MOTIVATION_LABELS: Record<Motivation, string> = {
  health: "Здоровье",
  look: "Внешний вид",
  energy: "Энергия и самочувствие",
  unsure: "Пока не определился",
};

const RECENT_DIETING_LABELS: Record<RecentDieting, string> = {
  no: "Не садился",
  recently: "Один-два раза",
  constantly: "Почти постоянно",
};

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  calm: "Спокойно, без особых сложностей",
  tense: "Иногда напряжённо — бывают срывы или чувство вины",
  hard: "Еда занимает много мыслей почти каждый день",
};

const SLEEP_LABELS: Record<Sleep, string> = {
  ok: "Нормально",
  poor: "Часто не высыпаюсь",
};

const LIFE_LOAD_LABELS: Record<LifeLoad, string> = {
  calm: "Спокойный период",
  busy: "Много дел",
  overloaded: "Ощущаю перегрузку",
};

// Порядок здесь совпадает с фактическим порядком экранов и нужен только для
// resolveCurrentStep — чтобы, если текущий шаг исчез из маршрута (например,
// человек вернулся и поменял ответ), откатиться на ближайший предыдущий из
// ещё видимых, а не улететь в начало.
const ALL_STEPS: StepId[] = [
  "motivation", "recentDieting", "relationship", "sleep", "lifeLoad",
  "softening", "birthYear", "ageStop", "sex", "body", "targetWeight",
  "activity", "pace", "result",
];

// Только шаги, у которых есть смысл считать «шаг N из M» — развилки
// (softening, ageStop) и результат в счётчик не входят: прогресс — это про
// «сколько вопросов осталось», а не про экраны вообще.
const PROGRESS_STEPS: StepId[] = [
  "motivation", "recentDieting", "relationship", "sleep", "lifeLoad",
  "birthYear", "sex", "body", "targetWeight", "activity", "pace",
];

const STEP_CAPTIONS: Partial<Record<StepId, string>> = {
  motivation: "Мотивация",
  recentDieting: "Диеты за год",
  relationship: "Отношения с едой",
  sleep: "Сон",
  lifeLoad: "Нагрузка",
  birthYear: "Год рождения",
  sex: "Пол для формулы",
  body: "Рост и вес",
  targetWeight: "Желаемый вес",
  activity: "Активность",
  pace: "Темп",
};

function isMinorYear(birthYear: number, currentYear: number): boolean {
  return currentYear - birthYear < ADULT_AGE;
}

/** Младше нижней границы — единственный случай, когда расчёт обрывается. */
function isTooYoung(birthYear: number, currentYear: number): boolean {
  return currentYear - birthYear < MIN_AGE;
}

/**
 * Какие шаги показывать при текущих ответах.
 *
 * Развилок две, и они разные по смыслу. Младше четырнадцати — расчёт
 * обрывается: этой аудитории у сервиса нет, и спрашивать рост с весом не
 * надо. От четырнадцати до восемнадцати расчёт идёт целиком, но без выбора
 * темпа: темп бывает только у дефицита, а дефицит подростку не считается.
 * Запрещать смотреть, что ты ешь, смысла нет — запрещать нужно дефицит.
 */
function buildSteps(
  answers: Answers,
  reason: SofteningReason | null,
  minor: boolean,
  tooYoung: boolean,
): StepId[] {
  const steps: StepId[] = ["motivation", "recentDieting", "relationship", "sleep", "lifeLoad"];
  if (reason) steps.push("softening");
  steps.push("birthYear");
  if (tooYoung) {
    steps.push("ageStop");
    return steps;
  }
  steps.push("sex", "body", "targetWeight", "activity");
  if (!reason && !minor) steps.push("pace");
  steps.push("result");
  return steps;
}

function inRange(value: number | undefined, min: number, max: number): boolean {
  return value !== undefined && Number.isFinite(value) && value >= min && value <= max;
}

function isStepComplete(step: StepId, answers: Answers, currentYear: number): boolean {
  switch (step) {
    case "motivation": return answers.motivation !== undefined;
    case "recentDieting": return answers.recentDieting !== undefined;
    case "relationship": return answers.relationship !== undefined;
    case "sleep": return answers.sleep !== undefined;
    case "lifeLoad": return answers.lifeLoad !== undefined;
    case "softening": return true;
    case "birthYear": return inRange(answers.birthYear, MIN_BIRTH_YEAR, currentYear - MIN_AGE_FOR_FORM);
    case "ageStop": return true;
    case "sex": return answers.sexForFormula !== undefined;
    case "body": return inRange(answers.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM) && inRange(answers.weightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG);
    // Необязательный шаг: пустое поле — законный ответ «пропускаю», а не
    // недоделанная форма.
    case "targetWeight": return true;
    case "activity": return answers.activity !== undefined;
    case "pace": return answers.pace !== undefined;
    case "result": return true;
  }
}

function resolveCurrentStep(step: StepId, steps: StepId[]): StepId {
  if (steps.includes(step)) return step;
  const fallbackFrom = ALL_STEPS.indexOf(step);
  for (let i = fallbackFrom - 1; i >= 0; i -= 1) {
    if (steps.includes(ALL_STEPS[i])) return ALL_STEPS[i];
  }
  return steps[0];
}

function nextStepOf(step: StepId, steps: StepId[]): StepId | null {
  const idx = steps.indexOf(step);
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
}

function previousStepOf(step: StepId, steps: StepId[]): StepId | null {
  const idx = steps.indexOf(step);
  return idx > 0 ? steps[idx - 1] : null;
}

function countableProgress(step: StepId, steps: StepId[]): { index: number; total: number } | null {
  if (!PROGRESS_STEPS.includes(step)) return null;
  const countable = steps.filter((s) => PROGRESS_STEPS.includes(s));
  const idx = countable.indexOf(step);
  if (idx < 0) return null;
  return { index: idx + 1, total: countable.length };
}

export default function PlanFlow({ currentYear }: { currentYear: number }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [rawStep, setRawStep] = useState<StepId>("motivation");

  // Причина смягчить цель считается только по пяти вопросам безопасности —
  // ровно тем, что уже отвечены к этому моменту потока. Признак «minor» сюда
  // сознательно не входит: год рождения на этом шаге ещё не спрошен, и у
  // него — отдельный, более жёсткий стоп чуть ниже.
  const { motivation, recentDieting, relationship, sleep, lifeLoad } = answers;
  const reason = useMemo(() => {
    if (motivation === undefined || recentDieting === undefined || relationship === undefined || sleep === undefined || lifeLoad === undefined) {
      return null;
    }
    return softeningReason({ motivation, recentDieting, relationship, sleep, lifeLoad });
  }, [motivation, recentDieting, relationship, sleep, lifeLoad]);

  const minor = answers.birthYear !== undefined && isMinorYear(answers.birthYear, currentYear);
  const tooYoung = answers.birthYear !== undefined && isTooYoung(answers.birthYear, currentYear);
  // Возраст смягчает цель наравне с ответами про еду и сон — тем же правилом,
  // что и в дневнике (effectiveGoal в lib/onboarding.ts).
  const goal: Goal = reason || minor ? "maintain" : "lose";

  const steps = useMemo(
    () => buildSteps(answers, reason, minor, tooYoung),
    [answers, reason, minor, tooYoung],
  );
  const step = resolveCurrentStep(rawStep, steps);
  const progress = countableProgress(step, steps);
  const previous = previousStepOf(step, steps);
  const complete = isStepComplete(step, answers, currentYear);

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    const next = nextStepOf(step, steps);
    if (next) setRawStep(next);
  }

  function goBack() {
    if (previous) setRawStep(previous);
  }

  const canCompute =
    !tooYoung &&
    answers.sexForFormula !== undefined &&
    inRange(answers.birthYear, MIN_BIRTH_YEAR, currentYear - MIN_AGE_FOR_FORM) &&
    inRange(answers.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM) &&
    inRange(answers.weightKg, MIN_WEIGHT_KG, MAX_WEIGHT_KG) &&
    answers.activity !== undefined &&
    (goal !== "lose" || answers.pace !== undefined);

  // Пересчёт мгновенный и происходит прямо в браузере: ни одна из этих
  // функций не обращается к сети, а результат нигде не сохраняется.
  const targets: Targets | null = useMemo(() => {
    if (!canCompute) return null;
    return computeTargets(
      {
        goal,
        sexForFormula: answers.sexForFormula as SexForFormula,
        birthYear: answers.birthYear as number,
        heightCm: answers.heightCm as number,
        weightKg: answers.weightKg as number,
        activity: answers.activity as Activity,
        pace: goal === "lose" ? answers.pace : undefined,
      },
      currentYear,
    );
  }, [canCompute, goal, answers.sexForFormula, answers.birthYear, answers.heightCm, answers.weightKg, answers.activity, answers.pace, currentYear]);

  const fan: Fan | null = useMemo(() => {
    if (!targets) return null;
    return buildFan({
      sexForFormula: answers.sexForFormula as SexForFormula,
      birthYear: answers.birthYear as number,
      heightCm: answers.heightCm as number,
      weightKg: answers.weightKg as number,
      activity: answers.activity as Activity,
      intakeKcal: targets.kcalTarget,
      targetWeightKg: answers.targetWeightKg,
      currentYear,
    });
  }, [targets, answers.sexForFormula, answers.birthYear, answers.heightCm, answers.weightKg, answers.activity, answers.targetWeightKg, currentYear]);

  const protein: ProteinRange | null = answers.weightKg !== undefined ? proteinRange(answers.weightKg) : null;

  return <div className="plan-flow">
    {step !== "result" &&
      <div className="raschet-form">
        {progress &&
          <>
            <div className="usage-track"><div className="usage-fill" style={{ width: `${(progress.index / progress.total) * 100}%` }} /></div>
            <p className="field-note">Шаг {progress.index} из {progress.total} · {STEP_CAPTIONS[step]}</p>
          </>}

        {step === "motivation" &&
          <fieldset>
            <legend>Что вами движет сейчас</legend>
            <div className="radio-row">
              {(Object.keys(MOTIVATION_LABELS) as Motivation[]).map((option) =>
                <label className="radio-card" key={option}>
                  <input type="radio" name="motivation" value={option} checked={answers.motivation === option} onChange={() => set("motivation", option)} />
                  <span>{MOTIVATION_LABELS[option]}</span>
                </label>)}
            </div>
          </fieldset>}

        {step === "recentDieting" &&
          <fieldset>
            <legend>Как часто вы садились на диету за последний год</legend>
            <div className="radio-row">
              {(Object.keys(RECENT_DIETING_LABELS) as RecentDieting[]).map((option) =>
                <label className="radio-card" key={option}>
                  <input type="radio" name="recentDieting" value={option} checked={answers.recentDieting === option} onChange={() => set("recentDieting", option)} />
                  <span>{RECENT_DIETING_LABELS[option]}</span>
                </label>)}
            </div>
          </fieldset>}

        {step === "relationship" &&
          <fieldset>
            <legend>Как вы сейчас относитесь к еде</legend>
            <div className="radio-row">
              {(Object.keys(RELATIONSHIP_LABELS) as Relationship[]).map((option) =>
                <label className="radio-card" key={option}>
                  <input type="radio" name="relationship" value={option} checked={answers.relationship === option} onChange={() => set("relationship", option)} />
                  <span>{RELATIONSHIP_LABELS[option]}</span>
                </label>)}
            </div>
          </fieldset>}

        {step === "sleep" &&
          <fieldset>
            <legend>Как вы спите последний месяц</legend>
            <div className="radio-row">
              {(Object.keys(SLEEP_LABELS) as Sleep[]).map((option) =>
                <label className="radio-card" key={option}>
                  <input type="radio" name="sleep" value={option} checked={answers.sleep === option} onChange={() => set("sleep", option)} />
                  <span>{SLEEP_LABELS[option]}</span>
                </label>)}
            </div>
          </fieldset>}

        {step === "lifeLoad" &&
          <fieldset>
            <legend>Что сейчас происходит в жизни</legend>
            <div className="radio-row">
              {(Object.keys(LIFE_LOAD_LABELS) as LifeLoad[]).map((option) =>
                <label className="radio-card" key={option}>
                  <input type="radio" name="lifeLoad" value={option} checked={answers.lifeLoad === option} onChange={() => set("lifeLoad", option)} />
                  <span>{LIFE_LOAD_LABELS[option]}</span>
                </label>)}
            </div>
          </fieldset>}

        {step === "softening" && reason &&
          <div className="plan-branch">
            <h2 className="plan-branch-title">Дальше посчитаем норму на поддержание</h2>
            <p>{SOFTENING_NOTES[reason]}</p>
            <p className="field-note">
              Это не отказ, а другой результат: без дефицита, с цифрами, на которые прямо сейчас можно спокойно
              опираться.
            </p>
          </div>}

        {step === "birthYear" &&
          <fieldset>
            <legend>Год рождения</legend>
            <p className="field-note">
              Спрашиваем это раньше роста и веса. До 18 лет мы не считаем дефицит — план будет на
              поддержание; младше 14 расчёт не показываем вовсе, и тогда рост с весом не понадобятся.
            </p>
            <div className="onboarding-numbers">
              <label>Год
                <input
                  type="number"
                  min={MIN_BIRTH_YEAR}
                  max={currentYear}
                  value={answers.birthYear ?? ""}
                  onChange={(e) => set("birthYear", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </label>
            </div>
          </fieldset>}

        {step === "ageStop" &&
          <div className="plan-branch">
            <h2 className="plan-branch-title">Расчёт мы здесь не покажем</h2>
            <p>
              Сервис рассчитан на возраст от 14 лет. Рост и вес мы поэтому не спрашивали — они тут не нужны.
            </p>
            <p>
              Это не про вас лично: нормы питания в младшем возрасте считаются иначе, чем по взрослой формуле,
              и такой разговор стоит вести с педиатром, а не с калькулятором.
            </p>
            <div className="button-row">
              <button type="button" className="link-button" onClick={goBack} disabled={!previous}>Назад</button>
              <a className="black-button" href="/register">Начать дневник без цели по весу</a>
            </div>
          </div>}

        {step === "sex" &&
          <fieldset>
            <legend>Пол для формулы</legend>
            <p className="field-note">
              Формула Миффлина-Сан Жеора использует пол как косвенный признак состава тела — точнее по росту,
              весу и возрасту она считать не умеет.
            </p>
            <div className="radio-row">
              <label className="radio-card">
                <input type="radio" name="sexForFormula" value="female" checked={answers.sexForFormula === "female"} onChange={() => set("sexForFormula", "female")} />
                <span>Женский</span>
              </label>
              <label className="radio-card">
                <input type="radio" name="sexForFormula" value="male" checked={answers.sexForFormula === "male"} onChange={() => set("sexForFormula", "male")} />
                <span>Мужской</span>
              </label>
            </div>
          </fieldset>}

        {step === "body" &&
          <fieldset>
            <legend>Рост и вес сейчас</legend>
            <div className="onboarding-numbers">
              <label>Рост, см
                <input
                  type="number"
                  min={MIN_HEIGHT_CM}
                  max={MAX_HEIGHT_CM}
                  value={answers.heightCm ?? ""}
                  onChange={(e) => set("heightCm", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </label>
              <label>Вес, кг
                <input
                  type="number"
                  step="0.1"
                  min={MIN_WEIGHT_KG}
                  max={MAX_WEIGHT_KG}
                  value={answers.weightKg ?? ""}
                  onChange={(e) => set("weightKg", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </label>
            </div>
          </fieldset>}

        {step === "targetWeight" &&
          <fieldset>
            <legend>Желаемый вес (необязательно)</legend>
            <p className="field-note">
              Можно оставить пустым — тогда график ниже покажет только траекторию, без линии цели.
            </p>
            <div className="onboarding-numbers">
              <label>Кг
                <input
                  type="number"
                  step="0.5"
                  min={MIN_WEIGHT_KG}
                  max={MAX_WEIGHT_KG}
                  value={answers.targetWeightKg ?? ""}
                  onChange={(e) => set("targetWeightKg", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              </label>
            </div>
          </fieldset>}

        {step === "activity" &&
          <fieldset>
            <legend>Обычная активность</legend>
            <div className="radio-row">
              {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((option) =>
                <label className="radio-card" key={option}>
                  <input type="radio" name="activity" value={option} checked={answers.activity === option} onChange={() => set("activity", option)} />
                  <span>{ACTIVITY_LABELS[option]}</span>
                </label>)}
            </div>
          </fieldset>}

        {step === "pace" &&
          <fieldset>
            <legend>Какой темп вам подходит</legend>
            <div className="pace-row">
              {PACE_OPTIONS.map((option) =>
                <label className="pace-card" key={option.key}>
                  <input type="radio" name="pace" value={option.key} checked={answers.pace === option.key} onChange={() => set("pace", option.key)} />
                  <span><b>{option.label}</b><span>{option.note}</span></span>
                </label>)}
            </div>
          </fieldset>}

        {step !== "ageStop" &&
          <div className="button-row">
            <button type="button" className="link-button" onClick={goBack} disabled={!previous}>Назад</button>
            <button type="button" className="black-button" onClick={goNext} disabled={!complete}>Далее</button>
          </div>}
      </div>}

    {step === "result" && targets && fan && protein &&
      <PlanResult goal={goal} reason={reason} minor={minor} targets={targets} fan={fan} protein={protein} targetWeightKg={answers.targetWeightKg} />}
  </div>;
}

/** Строчная только первая буква: `toLowerCase()` целиком портил середину фразы. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function PlanResult({ goal, reason, minor, targets, fan, protein, targetWeightKg }: {
  goal: Goal;
  reason: SofteningReason | null;
  /** 14–17 лет: цель смягчена возрастом, а не ответами про еду и сон. */
  minor: boolean;
  targets: Targets;
  fan: Fan;
  protein: ProteinRange;
  targetWeightKg?: number;
}) {
  // Цель отправляется здесь, а не по нажатию «Далее» на последнем шаге:
  // считается доведённым до конца тот расчёт, чей результат человек увидел.
  // Пустой массив зависимостей — экран результата монтируется один раз.
  useEffect(() => { reachGoal(GOAL_PLAN_DONE); }, []);

  const range = targets.kcalMax - targets.kcalMin;
  const scalePercent = range > 0
    ? Math.min(100, Math.max(0, ((targets.kcalTarget - targets.kcalMin) / range) * 100))
    : 50;

  return <div className="plan-result">
    <div className="plan-result-head">
      <p className="kicker">Расчёт <i /></p>
      <h2 className="plan-result-title">Вот с чего начинаем</h2>
      <p className="plan-result-sub">Дальше — коридор, а не обещание.</p>
      {goal === "maintain" && (reason || minor) &&
        <p className="field-note">
          План ниже — на поддержание, без дефицита. Причина: {lowerFirst(SOFTENING_NOTES[reason ?? "minor"])}
        </p>}
      {targets.adjusted &&
        <p className="field-note">
          Мы подняли расчёт до безопасного минимума — ниже этой границы автоматические рекомендации не выдаём.
        </p>}
    </div>

    <div className="plan-corridor-card">
      <p className="plan-corridor-range">{targets.kcalMin}–{targets.kcalMax}<span>ккал в день</span></p>
      <div className="plan-scale">
        <div className="plan-scale-track" />
        <div className="plan-scale-dot" style={{ left: `${scalePercent}%` }} />
      </div>
      <p className="plan-scale-caption">вероятнее всего — {targets.kcalTarget} ккал</p>
      <p className="plan-corridor-line">белок {targets.proteinTarget} г · клетчатка {targets.fiberTarget} г</p>
    </div>

    <div className="plan-chart-card">
      <FanChart fan={fan} targetWeightKg={targetWeightKg} maintaining={goal !== "lose"} />
    </div>

    <div className="plan-numbers">
      <div>
        <p className="plan-number">{targets.kcalMin}–{targets.kcalMax}</p>
        <span>Энергия, ккал</span>
      </div>
      <div>
        {/* Цель, а не коридор: рядом с карточкой выше стоит то же число, и
            два разных под одной подписью читались бы как ошибка расчёта.
            Коридор из proteinRange даём подписью — он объясняет, что цифра
            не единственно верная. */}
        <p className="plan-number">{targets.proteinTarget}</p>
        <span>Белок, г · норма {protein.min}–{protein.max}</span>
      </div>
      <div>
        <p className="plan-number">от {targets.fiberTarget}</p>
        <span>Клетчатка, г</span>
      </div>
    </div>

    <div className="plan-principle">
      <p>
        Это стартовая вилка, не диагноз: любая формула по нескольким параметрам ошибается на 10–15% в обе
        стороны. Через две недели дневника посчитаем вашу настоящую норму — по тому, что вы правда едите, а не
        по таблице.
      </p>
    </div>

    <div className="plan-cta">
      <a className="black-button" href="/register">Записать первый приём</a>
      <p className="plan-quiet">Бесплатно и без подписки — это просто дневник.</p>
    </div>

    <p className="raschet-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее о границах сервиса →</Link>
    </p>
  </div>;
}

"use client";

import { useActionState, useState } from "react";
import { ACTIVITY_LABELS, GOAL_LABELS, type Activity, type Goal } from "@/lib/targets";
import { LIMIT_REASONS, PACE_OPTIONS } from "@/lib/pace";
import {
  deriveLivePlan,
  isStepComplete,
  maxBirthYear,
  MAX_HEIGHT_CM,
  MAX_TARGET_LOSS_KG,
  MAX_WEIGHT_KG,
  MIN_HEIGHT_CM,
  minBirthYear,
  MIN_WEIGHT_KG,
  nextStep,
  planSafetyReasons,
  previousStep,
  RELATIONSHIP_LABELS,
  resolveCurrentStep,
  SAFETY_NOTES,
  STEP_CAPTIONS,
  stepProgress,
  type OnboardingAnswers,
  type OnboardingStepId,
  type Relationship,
} from "@/lib/onboarding";
import { withPluralRu } from "@/lib/plural";
import { saveProfile, type ProfileState } from "../profile-actions";
import { setShowCalories } from "../meal-actions";

const errors: Partial<Record<ProfileState["status"], string>> = {
  invalid: "Проверьте значения — что-то выходит за разумные пределы.",
  error: "Не получилось сохранить. Попробуйте ещё раз через минуту.",
};

function formatKg(value: number): string {
  return value.toFixed(2).replace(/0$/, "").replace(".", ",");
}

export function OnboardingFlow({ currentYear }: { currentYear: number }) {
  const [state, action, pending] = useActionState(saveProfile, { status: "idle" } as ProfileState);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [rawStep, setRawStep] = useState<OnboardingStepId>("goal");
  const [hideCaloriesEnabled, setHideCaloriesEnabled] = useState(false);

  // Текущий шаг мог исчезнуть из маршрута, пока пользователь на нём стоял
  // (например, вернулся и передумал снижать вес, а шаг «темп» был открыт) —
  // resolveCurrentStep пересчитывает безопасное значение на каждый рендер;
  // отдельный эффект не нужен, это дешёвая чистая функция от ответов.
  const step = resolveCurrentStep(rawStep, answers, currentYear);
  const { index, total } = stepProgress(step, answers, currentYear);
  const plan = deriveLivePlan(answers, currentYear);
  const safetyReasons = plan ? planSafetyReasons(plan) : [];
  const complete = isStepComplete(step, answers, currentYear);
  const previous = previousStep(step, answers, currentYear);

  function set<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    const next = nextStep(step, answers, currentYear);
    if (next) setRawStep(next);
  }

  function goBack() {
    if (previous) setRawStep(previous);
  }

  // Серверный экшен вызывается напрямую из клиентского обработчика, а не
  // только как action формы — это тот же export, что уже использует кнопка
  // в настройках (app/app/settings/page.tsx), просто без промежуточной формы:
  // тут нужно оптимистично отметить состояние кнопки, а не перерисовать страницу.
  async function enableHideCalories() {
    setHideCaloriesEnabled(true);
    await setShowCalories(true);
  }

  const showRelationshipOffer = answers.relationship === "tense" || answers.relationship === "hard";

  return <main className="onboarding">
    <h1>Ваш стартовый план</h1>
    <p className="addflow-hint">
      Несколько коротких вопросов — план начнёт складываться уже после первых, а дальше будет уточняться на
      ваших глазах. Отправная точка, а не приговор: дальше он уточнится по вашей реальной динамике.
    </p>
    <p className="field-note">
      Эти ответы нужны только для расчёта вашего плана и никуда не передаются —
      см. <a href="/legal/privacy" target="_blank">политику конфиденциальности</a>.
    </p>

    <aside className="onboarding-preview">
      <p className="onboarding-preview-caption">Ваш план обновляется по мере ответов</p>
      {plan
        ? <>
            <p className="onboarding-preview-range">
              <strong>{plan.targets.kcalTarget}</strong>
              <small>ккал в день</small>
            </p>
            <p className="onboarding-preview-detail">
              вероятно между {plan.targets.kcalMin} и {plan.targets.kcalMax} ккал
              {plan.usingDefaultActivity && " · пока для лёгкой активности, уточним дальше"}
            </p>
            <p className="onboarding-preview-detail">
              белок {plan.targets.proteinTarget} г · клетчатка {plan.targets.fiberTarget} г
            </p>
            {plan.paceDetails &&
              <p className="onboarding-preview-detail">
                темп {formatKg(plan.paceDetails.kgPerWeek)} кг в неделю
                {plan.paceDetails.weeksToGoal !== null && ` · ${withPluralRu(plan.paceDetails.weeksToGoal, ["неделя", "недели", "недель"])} до цели`}
              </p>}
            {safetyReasons.map((reason) => <p className="onboarding-preview-note" key={reason}>{SAFETY_NOTES[reason]}</p>)}
          </>
        : <p className="onboarding-preview-placeholder">Ответьте на первые несколько вопросов — и план появится здесь.</p>}
    </aside>

    <div className="onboarding-form">
      <div className="usage-track"><div className="usage-fill" style={{ width: `${(index / total) * 100}%` }} /></div>
      <p className="field-note">Шаг {index} из {total} · {STEP_CAPTIONS[step]}</p>

      {step === "goal" &&
        <fieldset>
          <legend>Какая цель ближе всего сейчас</legend>
          <div className="radio-row">
            {(Object.entries(GOAL_LABELS) as Array<[Goal, string]>).map(([value, label]) =>
              <label className="radio-card" key={value}>
                <input type="radio" name="goal" value={value} checked={answers.goal === value} onChange={() => set("goal", value)} />
                <span>{label}</span>
              </label>)}
          </div>
        </fieldset>}

      {step === "relationship" &&
        <fieldset>
          <legend>Как сейчас, в целом, дела с едой</legend>
          <p className="field-note">Это не проверка — ответ помогает не предлагать дефицит там, где сначала важнее что-то другое.</p>
          <div className="radio-row">
            {(Object.entries(RELATIONSHIP_LABELS) as Array<[Relationship, string]>).map(([value, label]) =>
              <label className="radio-card" key={value}>
                <input
                  type="radio"
                  name="relationship"
                  value={value}
                  checked={answers.relationship === value}
                  onChange={() => set("relationship", value)}
                />
                <span>{label}</span>
              </label>)}
          </div>
          {showRelationshipOffer &&
            <div className="review-proposal">
              {answers.relationship === "hard" &&
                <p>
                  {answers.goal === "lose"
                    ? SAFETY_NOTES.hard_relationship
                    : "Судя по ответу, еда сейчас непростая тема. Если она забирает много сил, это повод поговорить со специалистом по расстройствам пищевого поведения — раньше, чем настраивать цифры в приложении."}
                </p>}
              <p>Цифры энергии можно вообще убрать из интерфейса — останутся белок, клетчатка и регулярность. Включить можно и позже, в настройках.</p>
              <button type="button" className="link-button" onClick={enableHideCalories} disabled={hideCaloriesEnabled}>
                {hideCaloriesEnabled ? "Режим «скрыть калории» включён" : "Включить режим «скрыть калории» сейчас"}
              </button>
            </div>}
        </fieldset>}

      {step === "sex" &&
        <fieldset>
          <legend>Пол для формулы расчёта</legend>
          <p className="field-note">Нужен только для формулы Миффлина-Сан Жеора — базовые затраты энергии считаются по-разному.</p>
          <div className="radio-row">
            <label className="radio-card">
              <input
                type="radio"
                name="sexForFormula"
                value="female"
                checked={answers.sexForFormula === "female"}
                onChange={() => set("sexForFormula", "female")}
              />
              <span>Женский</span>
            </label>
            <label className="radio-card">
              <input
                type="radio"
                name="sexForFormula"
                value="male"
                checked={answers.sexForFormula === "male"}
                onChange={() => set("sexForFormula", "male")}
              />
              <span>Мужской</span>
            </label>
          </div>
        </fieldset>}

      {step === "birthYear" &&
        <fieldset>
          <legend>Год рождения</legend>
          <div className="onboarding-numbers">
            <label>Год
              <input
                type="number"
                min={minBirthYear(currentYear)}
                max={maxBirthYear(currentYear)}
                value={answers.birthYear ?? ""}
                onChange={(e) => set("birthYear", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </label>
          </div>
        </fieldset>}

      {step === "height" &&
        <fieldset>
          <legend>Рост, см</legend>
          <div className="onboarding-numbers">
            <label>Рост
              <input
                type="number"
                min={MIN_HEIGHT_CM}
                max={MAX_HEIGHT_CM}
                value={answers.heightCm ?? ""}
                onChange={(e) => set("heightCm", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </label>
          </div>
        </fieldset>}

      {step === "weight" &&
        <fieldset>
          <legend>Вес, кг</legend>
          <div className="onboarding-numbers">
            <label>Вес
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

      {step === "activity" &&
        <fieldset>
          <legend>Обычная активность</legend>
          <div className="radio-row">
            {(Object.entries(ACTIVITY_LABELS) as Array<[Activity, string]>).map(([value, label]) =>
              <label className="radio-card" key={value}>
                <input type="radio" name="activity" value={value} checked={answers.activity === value} onChange={() => set("activity", value)} />
                <span>{label}</span>
              </label>)}
          </div>
        </fieldset>}

      {step === "pace" &&
        <fieldset>
          <legend>Темп снижения веса</legend>
          <div className="radio-row">
            {PACE_OPTIONS.map((option) =>
              <label className="radio-card" key={option.key}>
                <input
                  type="radio"
                  name="pace"
                  value={option.key}
                  checked={answers.pace === option.key}
                  onChange={() => set("pace", option.key)}
                />
                <span>{option.label}</span>
              </label>)}
          </div>
          {answers.pace && <p className="field-note">{PACE_OPTIONS.find((o) => o.key === answers.pace)?.note}</p>}
          {plan?.paceDetails?.limitedBy && <p className="field-note">{LIMIT_REASONS[plan.paceDetails.limitedBy]}</p>}
          <div className="onboarding-numbers">
            <label>Хотите сбросить, кг (необязательно)
              <input
                type="number"
                step="0.5"
                min={0.5}
                max={MAX_TARGET_LOSS_KG}
                value={answers.targetLossKg ?? ""}
                onChange={(e) => set("targetLossKg", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </label>
          </div>
        </fieldset>}

      {step === "summary" &&
        <form action={action}>
          <fieldset>
            <legend>Готово</legend>
            <p className="field-note">
              Это стартовая точка, а не приговор: план можно поменять в любой момент в настройках, а дальше он
              будет уточняться по вашему дневнику.
            </p>
            <input type="hidden" name="goal" value={plan?.effectiveGoal ?? answers.goal ?? "maintain"} />
            <input type="hidden" name="sexForFormula" value={answers.sexForFormula ?? ""} />
            <input type="hidden" name="birthYear" value={answers.birthYear ?? ""} />
            <input type="hidden" name="heightCm" value={answers.heightCm ?? ""} />
            <input type="hidden" name="weightKg" value={answers.weightKg ?? ""} />
            <input type="hidden" name="activity" value={answers.activity ?? "light"} />
            {/* Пусто, если темп не выбирали (цель не «снижение веса» или шаг темпа
                пропущен по безопасности) — profiles.pace для этого и nullable. */}
            <input type="hidden" name="pace" value={plan?.pace ?? ""} />
            {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
            <div className="button-row">
              <button type="button" className="link-button" onClick={goBack} disabled={!previous}>Назад</button>
              <button className="black-button" type="submit" disabled={pending || !plan}>
                {pending ? "Сохраняем…" : "Сохранить план"}
              </button>
            </div>
          </fieldset>
        </form>}

      {step !== "summary" &&
        <div className="button-row">
          <button type="button" className="link-button" onClick={goBack} disabled={!previous}>Назад</button>
          <button type="button" className="black-button" onClick={goNext} disabled={!complete}>Далее</button>
        </div>}
    </div>
  </main>;
}

"use client";

import { useActionState, useMemo, useState } from "react";
import {
  ACTIVITY_LABELS,
  computeTargets,
  GOAL_LABELS,
  type Activity,
  type Goal,
  type SexForFormula,
  type Targets,
} from "@/lib/targets";
import { saveProfile, type ProfileState } from "../profile-actions";

const errors: Partial<Record<ProfileState["status"], string>> = {
  invalid: "Проверьте значения — что-то выходит за разумные пределы.",
  error: "Не получилось сохранить. Попробуйте ещё раз через минуту.",
};

export default function OnboardingPage() {
  const [state, action, pending] = useActionState(saveProfile, { status: "idle" } as ProfileState);
  const currentYear = new Date().getFullYear();

  // Управляемое состояние формы — нужно только для живого предпросмотра;
  // server action по-прежнему читает те же поля из FormData по name.
  const [goal, setGoal] = useState<Goal>("maintain");
  const [sexForFormula, setSexForFormula] = useState<SexForFormula | "">("");
  const [activity, setActivity] = useState<Activity>("light");
  const [birthYear, setBirthYear] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  // Пересчитываем прямо во время рендера: computeTargets — чистая функция,
  // отдельный useEffect тут не нужен.
  const targets = useMemo<Targets | null>(() => {
    if (!sexForFormula || !birthYear || !heightCm || !weightKg) return null;
    const birthYearNum = Number(birthYear);
    const heightNum = Number(heightCm);
    const weightNum = Number(weightKg);
    if (!Number.isFinite(birthYearNum) || !Number.isFinite(heightNum) || !Number.isFinite(weightNum)) return null;
    return computeTargets(
      { goal, sexForFormula, birthYear: birthYearNum, heightCm: heightNum, weightKg: weightNum, activity },
      currentYear,
    );
  }, [goal, sexForFormula, birthYear, heightCm, weightKg, activity, currentYear]);

  return <main className="onboarding">
    <h1>Ваш стартовый план</h1>
    <p className="addflow-hint">
      Несколько вопросов — и мы посчитаем стартовый диапазон энергии и белка.
      Формула даёт только отправную точку: дальше план будет уточняться по вашей реальной динамике.
    </p>
    <p className="field-note">
      Эти ответы нужны только для расчёта вашего плана и никуда не передаются —
      см. <a href="/legal/privacy" target="_blank">политику конфиденциальности</a>.
    </p>

    <aside className="onboarding-preview">
      <p className="onboarding-preview-caption">Ваш план обновляется по мере ответов</p>
      {targets
        ? <>
            <p className="onboarding-preview-range">
              <strong>{targets.kcalTarget}</strong>
              <small>ккал в день</small>
            </p>
            <p className="onboarding-preview-detail">
              вероятно между {targets.kcalMin} и {targets.kcalMax} ккал
            </p>
            <p className="onboarding-preview-detail">
              белок {targets.proteinTarget} г · клетчатка {targets.fiberTarget} г
            </p>
            {targets.adjusted &&
              <p className="onboarding-preview-note">Мы подняли расчёт до безопасного минимума.</p>}
          </>
        : <p className="onboarding-preview-placeholder">Заполните рост и вес — и план появится здесь.</p>}
    </aside>

    <form action={action} className="onboarding-form">
      <fieldset>
        <legend>Цель</legend>
        <div className="radio-row">
          {(Object.entries(GOAL_LABELS) as Array<[Goal, string]>).map(([value, label]) =>
            <label className="radio-card" key={value}>
              <input
                type="radio"
                name="goal"
                value={value}
                checked={goal === value}
                onChange={() => setGoal(value)}
                required
              />
              <span>{label}</span>
            </label>)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Пол для формулы расчёта</legend>
        <p className="field-note">Нужен только для формулы Миффлина-Сан Жеора — базовые затраты энергии считаются по-разному.</p>
        <div className="radio-row">
          <label className="radio-card">
            <input
              type="radio"
              name="sexForFormula"
              value="female"
              checked={sexForFormula === "female"}
              onChange={() => setSexForFormula("female")}
              required
            />
            <span>Женский</span>
          </label>
          <label className="radio-card">
            <input
              type="radio"
              name="sexForFormula"
              value="male"
              checked={sexForFormula === "male"}
              onChange={() => setSexForFormula("male")}
            />
            <span>Мужской</span>
          </label>
        </div>
      </fieldset>

      <div className="onboarding-numbers">
        <label>Год рождения
          <input
            name="birthYear"
            type="number"
            min={currentYear - 100}
            max={currentYear - 14}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            required
          />
        </label>
        <label>Рост, см
          <input
            name="heightCm"
            type="number"
            min={120}
            max={230}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            required
          />
        </label>
        <label>Вес, кг
          <input
            name="weightKg"
            type="number"
            min={30}
            max={300}
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            required
          />
        </label>
      </div>

      <fieldset>
        <legend>Активность</legend>
        <div className="radio-row">
          {(Object.entries(ACTIVITY_LABELS) as Array<[Activity, string]>).map(([value, label]) =>
            <label className="radio-card" key={value}>
              <input
                type="radio"
                name="activity"
                value={value}
                checked={activity === value}
                onChange={() => setActivity(value)}
                required
              />
              <span>{label}</span>
            </label>)}
        </div>
      </fieldset>

      {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
      <button className="black-button" type="submit" disabled={pending}>{pending ? "Считаем…" : "Посчитать мой план"}</button>
    </form>
  </main>;
}

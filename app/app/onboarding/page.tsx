"use client";

import { useActionState } from "react";
import { ACTIVITY_LABELS, GOAL_LABELS } from "@/lib/targets";
import { saveProfile, type ProfileState } from "../profile-actions";

const errors: Partial<Record<ProfileState["status"], string>> = {
  invalid: "Проверьте значения — что-то выходит за разумные пределы.",
  error: "Не получилось сохранить. Попробуйте ещё раз через минуту.",
};

export default function OnboardingPage() {
  const [state, action, pending] = useActionState(saveProfile, { status: "idle" } as ProfileState);
  const currentYear = new Date().getFullYear();

  return <main className="onboarding">
    <h1>Ваш стартовый план</h1>
    <p className="addflow-hint">
      Несколько вопросов — и мы посчитаем стартовый диапазон энергии и белка.
      Формула даёт только отправную точку: дальше план будет уточняться по вашей реальной динамике.
    </p>

    <form action={action} className="onboarding-form">
      <fieldset>
        <legend>Цель</legend>
        <div className="radio-row">
          {Object.entries(GOAL_LABELS).map(([value, label], index) =>
            <label className="radio-card" key={value}>
              <input type="radio" name="goal" value={value} defaultChecked={index === 1} required />
              <span>{label}</span>
            </label>)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Пол для формулы расчёта</legend>
        <p className="field-note">Нужен только для формулы Миффлина-Сан Жеора — базовые затраты энергии считаются по-разному.</p>
        <div className="radio-row">
          <label className="radio-card"><input type="radio" name="sexForFormula" value="female" required /><span>Женский</span></label>
          <label className="radio-card"><input type="radio" name="sexForFormula" value="male" /><span>Мужской</span></label>
        </div>
      </fieldset>

      <div className="onboarding-numbers">
        <label>Год рождения<input name="birthYear" type="number" min={currentYear - 100} max={currentYear - 14} required /></label>
        <label>Рост, см<input name="heightCm" type="number" min={120} max={230} required /></label>
        <label>Вес, кг<input name="weightKg" type="number" min={30} max={300} step="0.1" required /></label>
      </div>

      <fieldset>
        <legend>Активность</legend>
        <div className="radio-row">
          {Object.entries(ACTIVITY_LABELS).map(([value, label], index) =>
            <label className="radio-card" key={value}>
              <input type="radio" name="activity" value={value} defaultChecked={index === 1} required />
              <span>{label}</span>
            </label>)}
        </div>
      </fieldset>

      {errors[state.status] && <p className="form-error">{errors[state.status]}</p>}
      <button className="black-button" type="submit" disabled={pending}>{pending ? "Считаем…" : "Посчитать мой план"}</button>
    </form>
  </main>;
}

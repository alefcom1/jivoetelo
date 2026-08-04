"use client";

// Метод ладони: мера, которая всегда с собой. Отличие нашей подачи — мы
// сразу переводим меры в граммы и калории на примерах из справочника,
// вместо обычной таблицы «мужчинам две ладони, женщинам одну». Так видно и
// пользу метода, и его границы.

import { useState } from "react";
import { HAND_MEASURES, handGrams, handPerMeal } from "@/lib/hand-portions";
import { FOOD_REFERENCE } from "@/lib/food-reference";

export default function HandForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [meals, setMeals] = useState(3);

  // Итог дня по методу: сумма мер × число приёмов пищи.
  const dayTotal = HAND_MEASURES.reduce((sum, measure) => {
    const grams = handGrams(measure, sex) * handPerMeal(measure, sex) * meals;
    const example = FOOD_REFERENCE.find((f) => f.name === measure.examples[0]);
    return sum + (example ? (example.kcal * grams) / 100 : 0);
  }, 0);

  return <div className="raschet-form" role="group" aria-label="Порция по ладони">
    <fieldset>
      <legend>Чья рука</legend>
      <div className="raschet-choice">
        {(["female", "male"] as const).map((key) => <button key={key} type="button"
          className={sex === key ? "active" : ""} onClick={() => setSex(key)}>
          {key === "female" ? "Женская" : "Мужская"}
        </button>)}
      </div>
    </fieldset>

    <ul className="hand-list">
      {HAND_MEASURES.map((measure) => {
        const grams = handGrams(measure, sex);
        const perMeal = handPerMeal(measure, sex);
        const example = FOOD_REFERENCE.find((f) => f.name === measure.examples[0]);
        return <li key={measure.key} className={`hand-card hand-card--${measure.key}`}>
          <div className="hand-card-top">
            <span className="hand-icon" aria-hidden><HandIcon kind={measure.key} /></span>
            <div>
              <b>{measure.name}</b>
              <span>{measure.measures}</span>
            </div>
            <strong>≈{grams} г</strong>
          </div>
          <p className="hand-card-meal">
            В приём пищи: <b>{perMeal} {perMeal === 1 ? "мера" : "меры"}</b> — это около {grams * perMeal} г
            {example && <>, например {example.name.toLowerCase()} на {Math.round((example.kcal * grams * perMeal) / 100)} ккал</>}.
          </p>
          <p className="hand-card-caveat">{measure.caveat}</p>
        </li>;
      })}
    </ul>

    <div className="raschet-fields">
      <label>
        Приёмов пищи в день
        <input type="number" inputMode="numeric" min={2} max={6} value={meals}
          onChange={(e) => setMeals(Math.min(6, Math.max(2, Math.round(Number(e.target.value) || 3))))} />
      </label>
    </div>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">≈{Math.round(dayTotal / 50) * 50} <span>ккал за день</span></p>
        <p className="raschet-hint">
          Очень грубая оценка: посчитана по первому примеру из каждой меры при {meals} приёмах пищи.
          Реальная цифра зависит от того, что именно лежит в ладони, — жирная рыба и треска
          различаются вдвое. Метод хорош не точностью, а тем, что удерживает пропорции без весов.
        </p>
      </div>
    </div>
  </div>;
}

/** Простые пиктограммы мер: ладонь, кулак, горсть, палец. */
function HandIcon({ kind }: { kind: "palm" | "fist" | "cupped" | "thumb" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" as const };
  if (kind === "palm") {
    return <svg viewBox="0 0 40 40" aria-hidden>
      <path {...common} d="M12 30V14a3 3 0 016 0v-2a3 3 0 016 0v2a3 3 0 016 0v12a8 8 0 01-8 8h-6a6 6 0 01-6-6z" />
    </svg>;
  }
  if (kind === "fist") {
    return <svg viewBox="0 0 40 40" aria-hidden>
      <rect {...common} x="9" y="14" width="22" height="18" rx="8" />
      <path {...common} d="M13 18h14M13 23h14" />
    </svg>;
  }
  if (kind === "cupped") {
    return <svg viewBox="0 0 40 40" aria-hidden>
      <path {...common} d="M8 18c0 9 5 14 12 14s12-5 12-14" />
      <path {...common} d="M14 14c2-3 10-3 12 0" />
    </svg>;
  }
  return <svg viewBox="0 0 40 40" aria-hidden>
    <rect {...common} x="15" y="10" width="10" height="20" rx="5" />
  </svg>;
}

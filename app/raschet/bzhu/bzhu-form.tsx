"use client";

// Калькулятор БЖУ. Считает не «идеальное соотношение», а граммы под уже
// известную норму калорий: соотношение в процентах — производная величина,
// и начинать с неё значит подгонять еду под красивую пропорцию вместо
// собственных потребностей.
//
// Белок берётся из lib/protein (коридор по весу), жир — доля калорийности,
// углеводы — остаток. Ровно та же логика, что в дневнике: расхождение
// между калькулятором и приложением было бы хуже отсутствия калькулятора.

import { useState } from "react";
import { proteinRange } from "@/lib/protein";
import { computeTargets, type Activity, type Goal } from "@/lib/targets";

const GOALS: Array<{ key: Goal; label: string }> = [
  { key: "lose", label: "Снижение веса" },
  { key: "maintain", label: "Поддержание" },
  { key: "gain", label: "Набор массы" },
];

const ACTIVITIES: Array<{ key: Activity; label: string; hint: string }> = [
  { key: "sedentary", label: "Сидячий образ жизни", hint: "работа за столом, спорта нет" },
  { key: "light", label: "Лёгкая активность", hint: "прогулки, 1–2 тренировки в неделю" },
  { key: "moderate", label: "Умеренная", hint: "3–4 тренировки в неделю" },
  { key: "high", label: "Высокая", hint: "5+ тренировок или физическая работа" },
];

/** Доля жира от калорийности: коридор, внутри которого выбор — дело вкуса. */
const FAT_SHARES = [
  { value: 0.25, label: "25%", note: "больше углеводов — удобно при высокой нагрузке" },
  { value: 0.3, label: "30%", note: "середина коридора, подходит большинству" },
  { value: 0.35, label: "35%", note: "сытнее, если тяжело переносите низкожировой рацион" },
];

export default function BzhuForm() {
  const [sex, setSex] = useState<"female" | "male">("female");
  const [age, setAge] = useState(30);
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(70);
  const [activity, setActivity] = useState<Activity>("light");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [fatShare, setFatShare] = useState(0.3);

  const year = 2026;
  const targets = computeTargets({
    sexForFormula: sex, birthYear: year - age, heightCm: height, weightKg: weight, activity, goal,
  }, year);

  const kcal = targets.kcalTarget;
  const protein = proteinRange(weight);
  const proteinG = Math.round(protein.target);
  const proteinKcal = proteinG * 4;
  const fatKcal = Math.min(kcal - proteinKcal, kcal * fatShare);
  const fatG = Math.round(fatKcal / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinKcal - fatKcal) / 4));

  const shares = {
    protein: Math.round((proteinKcal / kcal) * 100),
    fat: Math.round((fatG * 9 / kcal) * 100),
    carbs: Math.round((carbsG * 4 / kcal) * 100),
  };

  return <div className="raschet-form" role="group" aria-label="Расчёт БЖУ">
    <fieldset>
      <legend>Пол</legend>
      <div className="raschet-choice">
        {(["female", "male"] as const).map((key) => <button key={key} type="button"
          className={sex === key ? "active" : ""} onClick={() => setSex(key)}>
          {key === "female" ? "Женский" : "Мужской"}
        </button>)}
      </div>
    </fieldset>

    <div className="raschet-fields">
      <label>Возраст<input type="number" inputMode="numeric" min={14} max={100} value={age}
        onChange={(e) => setAge(clamp(Number(e.target.value), 14, 100))} /></label>
      <label>Рост, см<input type="number" inputMode="numeric" min={120} max={230} value={height}
        onChange={(e) => setHeight(clamp(Number(e.target.value), 120, 230))} /></label>
      <label>Вес, кг<input type="number" inputMode="decimal" min={35} max={250} value={weight}
        onChange={(e) => setWeight(clamp(Number(e.target.value), 35, 250))} /></label>
    </div>

    <fieldset>
      <legend>Активность</legend>
      <div className="raschet-choice raschet-choice--stack">
        {ACTIVITIES.map((item) => <button key={item.key} type="button"
          className={activity === item.key ? "active" : ""} onClick={() => setActivity(item.key)}>
          {item.label} <i>{item.hint}</i>
        </button>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Цель</legend>
      <div className="raschet-choice">
        {GOALS.map((item) => <button key={item.key} type="button"
          className={goal === item.key ? "active" : ""} onClick={() => setGoal(item.key)}>
          {item.label}
        </button>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Доля жира в рационе</legend>
      <div className="raschet-choice raschet-choice--stack">
        {FAT_SHARES.map((item) => <button key={item.value} type="button"
          className={fatShare === item.value ? "active" : ""} onClick={() => setFatShare(item.value)}>
          {item.label} <i>{item.note}</i>
        </button>)}
      </div>
    </fieldset>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{kcal} <span>ккал в день</span></p>

        <div className="bzhu-bar" aria-hidden>
          <span className="bzhu-bar--protein" style={{ width: `${shares.protein}%` }} />
          <span className="bzhu-bar--fat" style={{ width: `${shares.fat}%` }} />
          <span className="bzhu-bar--carbs" style={{ width: `${shares.carbs}%` }} />
        </div>

        <div className="raschet-submetrics">
          <div><strong>{proteinG} г</strong><span>Белки · {shares.protein}%</span></div>
          <div><strong>{fatG} г</strong><span>Жиры · {shares.fat}%</span></div>
          <div><strong>{carbsG} г</strong><span>Углеводы · {shares.carbs}%</span></div>
          <div><strong>{targets.fiberTarget} г</strong><span>Клетчатка</span></div>
        </div>

        <p className="raschet-adjusted">
          Белок посчитан по весу тела, а не долей от калорий: {protein.min}–{protein.max} г — рабочий
          коридор, мы взяли {proteinG} г. Жиры — {Math.round(fatShare * 100)}% калорийности.
          Углеводам достаётся остаток: это не «что осталось от важного», а самый гибкий макронутриент,
          которым удобно подгонять рацион под день.
        </p>
        <p className="raschet-hint">
          Диапазон, а не одна цифра: попадание в ±10% по каждому нутриенту — уже хороший день.
          Точность до грамма не нужна никому, кроме соревнующихся спортсменов.
        </p>
      </div>
    </div>
  </div>;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
